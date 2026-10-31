# FuryCube G11 RGB adapter

## Verified device

- VID/PID: `1D57:FA60`; product string: `G11 2.4G`.
- USB release: `0x1110` (a USB device revision value, not a firmware version claim).
- Configuration collection: interface 2, path `MI_02&Col04`, usage page `0x000B`, usage 0.
- Windows HID capabilities: feature reports 134 bytes; input/output report lengths 0.
- Other revisions, products, interfaces, and collections are rejected before writes.

## Evidence and physical validation

On 2026-10-28, outgoing `HidD_SetFeature` calls from the locally installed FURYCUBE HUB were recorded while the user changed static red, green, and blue and confirmed the physical LEDs followed. Read-only handle metadata mapped the official software's handle to the same configuration collection. The implementation uses independently reconstructed report fields, with captured byte sequences as regression fixtures; no vendor executable or library is bundled.

Captured RGB values were `#F20000`, `#22FF16`, and `#2B0FFF`. A subsequent PrismHub service call for `#22FF16`, brightness 100, was compared at the Windows HID boundary and produced the captured reports on the same interface. The user confirmed the mouse turned green. An earlier send was accepted by Windows but had no observed LED change; it is not counted as a physical success. The successful comparison occurred with the vendor HUB open. Cold-start behavior without prior HUB initialization has not been verified.

## Supported operation

Only uniform static RGB is enabled. Brightness scales the RGB channels; speed has no effect on a static color. Other lighting effects, battery telemetry, button assignments, DPI, polling rate, and firmware writes are not added by this adapter.

Two zero-padded 134-byte feature reports are sent:

1. Preparation prefix: `0C 0A 01 FE 01 FE`.
2. Lighting: `05 0F 01 10 03 18 RR GG BB 01 02 HH LL 00 00`, followed by zeros.

`HH LL` is the big-endian 16-bit sum of bytes 3 through 10. The sum includes carries; it is not the Attack Shark X11 checksum. Preparation and lighting are separated by at least 500 ms, matching the observed HUB cadence. Writes are serialized, rate-limited to one request per second, recheck the connected interface before each report, reject partial writes, and close their handle on success or error. Discovery only opens and closes the collection; it sends no reports.

The adapter sends only preparation and lighting, never the vendor HUB's full profile, DPI, polling, power-management, or button reports. The keyboard and Attack Shark protocols remain unchanged.

Windows accepting reports is reported as `host-accepted`, not as a device acknowledgement. The renderer asks the user to verify the physical LEDs. If lighting does not change, verify the mouse is awake and recognized by the official HUB; report cold-start or competing-driver behavior rather than claiming success.
