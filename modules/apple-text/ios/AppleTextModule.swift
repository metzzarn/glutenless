import ExpoModulesCore
import UIKit
import Vision

/**
 * Reads the text in a photo with Apple's Vision framework, on the device.
 * It's stronger than ML Kit on iPhone, and runs on every iPhone, unlike
 * Apple's on-device language model. Lines come back with their boxes in the
 * photo's pixels, the same shape as ML Kit's, so the matcher and the scan
 * debug overlay work unchanged.
 */
public class AppleTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleText")

    // Debug: the photos in a folder of the app's Documents dir, as file:// URIs,
    // for the bench (glutenless://bench). On the simulator, copy them into
    // `xcrun simctl get_app_container booted com.glutenless.app data`/Documents/<dir>/.
    Function("listImages") { (dir: String) throws -> [String] in
      guard dir == "images" || dir == "menus" else {
        throw Exception(name: "ERR_BAD_DIR", description: "Unknown photo folder: \(dir)")
      }
      let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(dir)
      let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isRegularFileKey])) ?? []
      return files
        .filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
        .map { $0.absoluteString }
    }

    // Async functions run off the main thread, so the synchronous Vision request can't block the UI.
    AsyncFunction("recognizeAsync") { (url: URL) throws -> [[String: Any]] in
      guard let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
        throw Exception(name: "ERR_BAD_IMAGE", description: "Could not read image: \(url)")
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      // Correction "fixes" words toward a dictionary, which turns brand names
      // into other words. The matcher already copes with misreads.
      request.usesLanguageCorrection = false
      request.automaticallyDetectsLanguage = true

      // With the photo's orientation given, boxes are relative to the upright photo.
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: CGImagePropertyOrientation(image.imageOrientation))
      try handler.perform([request])

      // The upright photo's size in pixels.
      let width = image.size.width * image.scale
      let height = image.size.height * image.scale

      return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        // Vision's boxes are 0–1 with the origin at the bottom left.
        let box = observation.boundingBox
        // The line's rotated rectangle, clockwise from its top left: its true slant and height.
        let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
        return [
          "text": candidate.string,
          "confidence": Double(candidate.confidence),
          "corners": corners.map { [Double($0.x * width), Double((1 - $0.y) * height)] },
          "frame": [
            "left": Double(box.minX * width),
            "top": Double((1 - box.maxY) * height),
            "width": Double(box.width * width),
            "height": Double(box.height * height),
          ],
        ]
      }
    }
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
