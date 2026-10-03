import { magnificationLimit, pinchMagnification, zoomForMagnification } from '../lib/cameraZoom';

describe('camera zoom', () => {
  it('scales magnification by the pinch, from any starting zoom', () => {
    expect(pinchMagnification(1, 2, 10)).toBe(2);
    expect(pinchMagnification(4, 2, 10)).toBe(8);
    // Fingers closing a little at the start of a new pinch only nudge the zoom.
    expect(pinchMagnification(4, 0.95, 10)).toBeCloseTo(3.8);
  });

  it('keeps magnification between 1× and the limit', () => {
    expect(pinchMagnification(2, 0.1, 10)).toBe(1);
    expect(pinchMagnification(8, 4, 10)).toBe(10);
  });

  it("maps magnification to Android's fraction of the max zoom ratio", () => {
    expect(zoomForMagnification(1, 'android', 30)).toBe(0);
    expect(zoomForMagnification(3, 'android', 30)).toBeCloseTo(0.1);
    expect(zoomForMagnification(3, 'android', null)).toBe(0);
  });

  it("maps magnification to iOS's exponential zoom", () => {
    expect(zoomForMagnification(1, 'ios', null)).toBe(0);
    expect(zoomForMagnification(4, 'ios', null)).toBeCloseTo(0.5);
  });

  it('limits Android zoom to what the camera can do, up to 10×', () => {
    expect(magnificationLimit('android', 30)).toBe(10);
    expect(magnificationLimit('android', 5)).toBe(5);
    expect(magnificationLimit('android', null)).toBe(1);
    expect(magnificationLimit('ios', null)).toBe(10);
  });
});
