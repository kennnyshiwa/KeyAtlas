import Foundation
import XCTest
@testable import RelatedContract

final class RelatedContractTests: XCTestCase, @unchecked Sendable {
    private func routeBytes() throws -> Data {
        try Data(contentsOf: Bundle.module.url(forResource: "route-response", withExtension: "json")!)
    }

    func testActualRouteResponseThroughUnchangedShippedAnonymousAPIClient() async throws {
        Wire.reset()
        Wire.setPayload(try routeBytes())
        KeychainService.reset(token: "unused-test-token", cookie: "unused-test-cookie")
        let api = APIClient(session: ForumTestTransport.session)
        let slug = "mtnu-oblivion"
        // Same response type/path/default anonymous auth as loadRelatedProjects at 989d0545.
        let response: APIDataResponse<[Project]> = try await api.request(
            path: "/api/v1/projects/\(slug)/related"
        )
        XCTAssertEqual(response.data.count, 2)
        let card = try XCTUnwrap(response.data.first)
        XCTAssertEqual(card.title, "Contract card")
        XCTAssertEqual(card.status, .groupBuy)
        XCTAssertEqual(card.category?.id, "KEYCAPS")
        XCTAssertEqual(card.category?.name, "Keycaps")
        XCTAssertEqual(card.categoryId, "KEYCAPS")
        XCTAssertEqual(card.designer?.displayName, "Public creator")
        XCTAssertEqual(card.designerProfile?.name, "Fixture designer")
        XCTAssertEqual(card.pricing?.minPrice, 12900)
        XCTAssertEqual(card.pricing?.maxPrice, 14900)
        XCTAssertEqual(card.pricing?.currency, "USD")
        XCTAssertEqual(card.heroImageUrl, "https://example.invalid/hero.png")
        XCTAssertEqual(card.gallery?.map(\.position), [0, 1])
        XCTAssertEqual(card.gallery?.first?.caption, "Front")
        XCTAssertEqual(card.vendors?.first?.vendor?.name, "Fixture vendor")
        XCTAssertEqual(card.vendors?.first?.url, "https://example.invalid/store")
        XCTAssertEqual(card.followCount, 2)
        XCTAssertEqual(card.favoriteCount, 2)
        XCTAssertEqual(card.apiCommentCount, 2)
        XCTAssertEqual(card.isFollowing, false)
        XCTAssertEqual(card.isFavorited, false)
        XCTAssertEqual(card.isInCollection, false)
        XCTAssertEqual(card.isFeatured, true)
        XCTAssertEqual(card.published, true)
        XCTAssertEqual(card.createdAt, "2026-09-01T12:34:56.000Z")
        XCTAssertEqual(card.updatedAt, card.createdAt)
        XCTAssertEqual(card.gbStartDate, card.createdAt)
        XCTAssertEqual(card.gbEndDate, "2026-10-01T00:00:00.000Z")
        XCTAssertEqual(card.estimatedDelivery, "Q1 2027")
        let nullable = response.data[1]
        XCTAssertEqual(nullable.title, "Nullable card")
        XCTAssertEqual(nullable.status, .completed)
        XCTAssertNil(nullable.heroImageUrl)
        XCTAssertNil(nullable.pricing?.minPrice)
        XCTAssertNil(nullable.designerProfile)
        XCTAssertEqual(nullable.followCount, 0)
        XCTAssertEqual(nullable.favoriteCount, 0)
        XCTAssertEqual(nullable.apiCommentCount, 0)
        XCTAssertEqual(nullable.gallery, [])
        XCTAssertEqual(KeychainService.readCount, 0)
        let request = try XCTUnwrap(Wire.requests.only)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/api/v1/projects/mtnu-oblivion/related")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    }

    func testExactDecoderRejectsStringCountsInsteadOfSilentlyAcceptingDrift() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: routeBytes()) as? [String: Any])
        var cards = try XCTUnwrap(object["data"] as? [[String: Any]])
        cards[0]["follow_count"] = "2"
        object["data"] = cards
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertThrowsError(try decoder.decode(APIDataResponse<[Project]>.self, from: JSONSerialization.data(withJSONObject: object)))
    }
}

private extension Array {
    var only: Element? { count == 1 ? first : nil }
}
