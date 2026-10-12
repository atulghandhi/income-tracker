// SyncV2Tests.swift
// Sync v2 on iOS: the JSON merge must match the web's byte for byte (fixtures written
// by tests/generateMergeFixtures.spec.ts from src/sync/merge.ts), keys this build does
// not know must survive a push, and the engine must keep devices converged.
//
// Foundation only, so it also runs on Linux (see ios/README.md).

import Foundation
import XCTest
@testable import IncomeTracker

// MARK: - Merge parity with src/sync/merge.ts

final class LedgerMergeParityTests: XCTestCase {

    private struct FixtureFile: Decodable {
        var cases: [Case]
    }

    private struct Case: Decodable {
        var name: String
        var base: JSONValue?
        var local: JSONValue
        var remote: JSONValue
        var now: String
        var expected: JSONValue
    }

    private func loadCases() throws -> [Case] {
        let candidates: [URL?] = [
            Bundle(for: Self.self).url(forResource: "merge-fixtures", withExtension: "json"),
            URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Fixtures/data/merge-fixtures.json"),
        ]
        guard let url = candidates.compactMap({ $0 }).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw XCTSkip("merge-fixtures.json not found; run GENERATE_MERGE_FIXTURES=1 npx playwright test tests/generateMergeFixtures.spec.ts")
        }
        return try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url)).cases
    }

    func testEveryFixtureMergesLikeTheWeb() throws {
        let cases = try loadCases()
        XCTAssertGreaterThanOrEqual(cases.count, 50)
        for fixture in cases {
            let merged = LedgerMerge.merge(base: fixture.base, local: fixture.local, remote: fixture.remote, now: fixture.now)
            XCTAssertEqual(merged.canonical, fixture.expected.canonical, fixture.name)
        }
    }
}

// MARK: - Unknown fields

final class UnknownFieldsTests: XCTestCase {

    private func json(_ text: String) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
    }

    func testCarriesForeignKeysAtEveryLevel() throws {
        let raw = try json("""
        {"schemaVersion":8,"futureRoot":{"x":1},"goal":{"legacy":true},
         "months":{"2026-10":{"note":"","futureMonth":2,"incomes":[],
           "expenses":[{"id":"e1","name":"Costa","futureEntry":"keep","imported":{"hash":"h","futureMeta":1}}]}},
         "accounts":[{"id":"a1","name":"Monzo","futureAccount":[1,2],"apr":9}],
         "goals":[{"id":"g1","futureGoal":true}]}
        """)
        let typed = try json("""
        {"schemaVersion":8,"months":{"2026-10":{"note":"","incomes":[],
           "expenses":[{"id":"e1","name":"Costa coffee","imported":{"hash":"h"}}]}},
         "accounts":[{"id":"a1","name":"Monzo"}],"goals":[{"id":"g1"}]}
        """)
        let carried = UnknownFields.carry(from: raw, into: typed)

        XCTAssertEqual(carried["futureRoot"], try json(#"{"x":1}"#))
        XCTAssertNil(carried["goal"], "legacy keys are dropped, not carried")
        let month = carried["months"]?["2026-10"]
        XCTAssertEqual(month?["futureMonth"], .number(2))
        let expense = month?["expenses"]?.arrayValue?.first
        XCTAssertEqual(expense?["futureEntry"], .string("keep"))
        XCTAssertEqual(expense?["name"], .string("Costa coffee"), "this device's edit wins over the server copy")
        XCTAssertEqual(expense?["imported"]?["futureMeta"], .number(1))
        let account = carried["accounts"]?.arrayValue?.first
        XCTAssertEqual(account?["futureAccount"], try json("[1,2]"))
        XCTAssertNil(account?["apr"])
        XCTAssertEqual(carried["goals"]?.arrayValue?.first?["futureGoal"], .bool(true))
    }

    func testDoesNotResurrectAFieldThisDeviceCleared() throws {
        let raw = try json(#"{"months":{"2026-10":{"expenses":[{"id":"e1","accountId":"a1","debtAccountId":"d1"}]}}}"#)
        let typed = try json(#"{"months":{"2026-10":{"expenses":[{"id":"e1","accountId":"a1"}]}}}"#)
        let carried = UnknownFields.carry(from: raw, into: typed)
        XCTAssertNil(carried["months"]?["2026-10"]?["expenses"]?.arrayValue?.first?["debtAccountId"])
    }
}

// MARK: - Engine

@MainActor
private final class FakeServer {
    var row: LedgerRow?
    var online = true
    var pushes = 0
    var listeners: [(Int, Int) -> Void] = []

    func push(_ state: JSONValue, baseRevision: Int, deviceId: String) throws -> PushOutcome {
        guard online else { throw URLError(.notConnectedToInternet) }
        pushes += 1
        let incomingSchema = state["schemaVersion"]?.numberValue ?? 0
        if let current = row, (current.state["schemaVersion"]?.numberValue ?? 0) > incomingSchema {
            return PushOutcome(status: .schemaTooOld, revision: current.revision, state: current.state, updatedBy: current.updatedBy)
        }
        if (row?.revision ?? 0) != baseRevision {
            guard let current = row else { return PushOutcome(status: .missing, revision: 0, state: nil, updatedBy: nil) }
            return PushOutcome(status: .conflict, revision: current.revision, state: current.state, updatedBy: current.updatedBy)
        }
        let next = LedgerRow(state: state, revision: baseRevision + 1, updatedBy: deviceId)
        row = next
        let schema = Int(incomingSchema)
        for listener in listeners { listener(next.revision, schema) }
        return PushOutcome(status: .ok, revision: next.revision, state: nil, updatedBy: deviceId)
    }
}

@MainActor
private final class FakeTransport: LedgerSyncTransport {
    let server: FakeServer
    init(_ server: FakeServer) { self.server = server }

    func pushLedger(_ state: JSONValue, baseRevision: Int, deviceId: String) async throws -> PushOutcome {
        await Task.yield()
        return try server.push(state, baseRevision: baseRevision, deviceId: deviceId)
    }

    func fetchLedgerRow() async throws -> LedgerRow? {
        await Task.yield()
        guard server.online else { throw URLError(.notConnectedToInternet) }
        return server.row
    }

    func fetchLedgerRevision() async throws -> Int? {
        guard server.online else { throw URLError(.notConnectedToInternet) }
        return server.row?.revision
    }
}

@MainActor
private final class FakeDevice: LedgerSyncHost, SyncMetaStore {
    var state: LedgerState
    var statuses: [SyncEngine.Status] = []
    var choice: (LedgerState, LedgerState)?
    var meta: SyncMeta?
    var engine: SyncEngine!

    init(_ name: String, server: FakeServer, state: LedgerState = LedgerState.initial) {
        self.state = state
        engine = SyncEngine(transport: FakeTransport(server), store: self, host: self, deviceId: "ios-\(name)")
        server.listeners.append { [weak self] revision, schema in
            self?.engine.onPoke(revision: revision, schemaVersion: schema)
        }
    }

    func edit(_ change: (inout LedgerState) -> Void) {
        change(&state)
        state.lastSavedAt = isoTimestampNow()
        engine.requestPush()
    }

    var expenseIds: [String] {
        state.months.values.flatMap { $0.expenses.map(\.id) }.sorted()
    }

    // LedgerSyncHost
    var syncLocalState: LedgerState { state }
    func syncReplaceLocal(_ next: LedgerState) { state = next }
    func syncNormalize(_ state: LedgerState) -> LedgerState { state }
    func syncStatusChanged(_ status: SyncEngine.Status) { statuses.append(status) }
    func syncNeedsChoice(local: LedgerState, cloud: LedgerState) { choice = (local, cloud) }
    func syncRemoteApplied() {}

    // SyncMetaStore
    func loadMeta(userId: String) -> SyncMeta? { meta?.userId == userId ? meta : nil }
    func saveMeta(_ meta: SyncMeta) { self.meta = meta }
    func clearMeta() { meta = nil }
}

private func expense(_ id: String, amount: Double = 10) -> ExpenseEntry {
    ExpenseEntry(id: id, name: id, category: "Food", amount: amount, color: "#2f7fdd", recurring: false)
}

private func add(_ entry: ExpenseEntry) -> (inout LedgerState) -> Void {
    { state in state.months[state.selectedMonth, default: .empty].expenses.append(entry) }
}

@MainActor
private func settle() async {
    for _ in 0..<200 { await Task.yield() }
}

@MainActor
final class SyncEngineTests: XCTestCase {

    func testEmptyAccountTakesThisDevicesData() async {
        let server = FakeServer()
        var initial = LedgerState.initial
        add(expense("coffee"))(&initial)
        let device = FakeDevice("a", server: server, state: initial)
        let outcome = await device.engine.start(userId: "u")
        await settle()
        XCTAssertEqual(outcome, .ready)
        XCTAssertEqual(server.row?.revision, 1)
        XCTAssertEqual(device.meta?.baseRevision, 1)
        XCTAssertEqual(server.pushes, 1)
    }

    func testAddOnOneDeviceAppearsOnTheOthers() async {
        let server = FakeServer()
        let web = FakeDevice("web", server: server)
        let iphone = FakeDevice("iphone", server: server)
        let android = FakeDevice("android", server: server)
        await web.engine.start(userId: "u")
        await settle()
        await iphone.engine.start(userId: "u")
        await android.engine.start(userId: "u")
        await settle()

        iphone.edit(add(expense("from-iphone")))
        await settle()
        for device in [web, iphone, android] {
            XCTAssertEqual(device.expenseIds, ["from-iphone"])
        }
    }

    func testOfflineEditsOnTwoDevicesBothSurvive() async {
        let server = FakeServer()
        let a = FakeDevice("a", server: server)
        let b = FakeDevice("b", server: server)
        await a.engine.start(userId: "u")
        await settle()
        await b.engine.start(userId: "u")
        await settle()

        server.online = false
        a.edit(add(expense("a-offline")))
        b.edit(add(expense("b-offline")))
        await settle()
        XCTAssertEqual(a.statuses.last, .offline)

        server.online = true
        a.engine.requestPush()
        b.engine.requestPush()
        await settle()
        a.engine.requestPull()
        await settle()

        let expected = ["a-offline", "b-offline"]
        XCTAssertEqual(Set(server.row.map { (try? $0.state.decoded(as: LedgerState.self))?.months.values.flatMap { $0.expenses.map(\.id) } ?? [] } ?? []), Set(expected))
        XCTAssertEqual(a.expenseIds, expected)
        XCTAssertEqual(b.expenseIds, expected)
    }

    func testNewerSchemaInTheCloudIsReadOnly() async throws {
        let server = FakeServer()
        var newer = try XCTUnwrap(JSONValue.encoding(LedgerState.initial).objectValue)
        newer["schemaVersion"] = .number(Double(CURRENT_SCHEMA_VERSION + 1))
        server.row = LedgerRow(state: .object(newer), revision: 3, updatedBy: "future")
        let device = FakeDevice("a", server: server)
        let outcome = await device.engine.start(userId: "u")
        XCTAssertEqual(outcome, .updateRequired)
        device.edit(add(expense("blocked")))
        await settle()
        XCTAssertEqual(server.pushes, 0)
        XCTAssertEqual(device.statuses.last, .updateRequired)
    }

    func testFirstSignInWithSeparateDataAsksAndCombineKeepsBoth() async {
        let server = FakeServer()
        var webState = LedgerState.initial
        add(expense("from-web"))(&webState)
        let web = FakeDevice("web", server: server, state: webState)
        await web.engine.start(userId: "u")
        await settle()

        var phoneState = LedgerState.initial
        add(expense("from-phone"))(&phoneState)
        let phone = FakeDevice("phone", server: server, state: phoneState)
        let outcome = await phone.engine.start(userId: "u")
        XCTAssertEqual(outcome, .choose)
        XCTAssertNotNil(phone.choice)

        await phone.engine.resolveFirstSync(.combine)
        await settle()
        XCTAssertEqual(phone.expenseIds, ["from-phone", "from-web"])
        XCTAssertEqual(web.expenseIds, ["from-phone", "from-web"])
    }

    func testForeignFormattingIsNotEchoedBack() async throws {
        let server = FakeServer()
        let phone = FakeDevice("phone", server: server)
        await phone.engine.start(userId: "u")
        await settle()
        let before = server.pushes

        // The web writes keys iOS omits (explicit nulls) plus a field iOS does not know.
        var web = try XCTUnwrap(JSONValue.encoding(phone.state).objectValue)
        web["defaultAccountId"] = .null
        web["goalPlannerSurplus"] = .null
        web["webOnlyField"] = .string("keep me")
        let revision = (server.row?.revision ?? 0) + 1
        server.row = LedgerRow(state: .object(web), revision: revision, updatedBy: "web")
        phone.engine.onPoke(revision: revision, schemaVersion: CURRENT_SCHEMA_VERSION)
        await settle()
        XCTAssertEqual(server.pushes, before, "pulling a differently formatted ledger must not push")

        phone.edit(add(expense("after")))
        await settle()
        XCTAssertEqual(server.row?.state["webOnlyField"], .string("keep me"), "a push keeps fields iOS does not know")
    }
}
