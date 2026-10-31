# Womier SK80 RGB adapter

> Status em 30/10/2026: módulo preservado como pesquisa, fora do registro HID padrão. O PrismHub não habilita suas escritas sem validação física do protocolo desta implementação. As seções abaixo descrevem o protocolo experimental, não uma capacidade habilitada em produção.

## Detection

The adapter requires VID/PID `05AC:024F`, HID interface `MI_03`, interface number 3, usage page `0xFF13`, and usage `0x01`. It opens only that interface. The Windows product string and VID/PID remain discovery evidence; the adapter is labeled experimental because this identifier does not establish a firmware revision.

Manual compatibility evidence on one unit: Womier-SK80 Driver V1.0 identified the device as `RKGK890` (`05AC:024F`) and changed its LEDs to green on 2026-10-25. This validates a physical RGB change through the vendor driver only; PrismHub's write sequence has not yet been physically verified.

## Supported operation

Only a uniform static RGB color is exposed. Brightness scales the RGB channel values. Pulse, wave, spectrum, per-key mapping, macros, and firmware operations are not supported by this adapter.

The report framing and key identifiers are based on the community SK80 protocol research linked above. Writes are serialized and use feature reports on the exact `MI_03` interface. The adapter reports that Windows accepted the reports; the renderer asks the user to verify the physical LEDs and does not claim device acknowledgement.

The official driver should be closed before using PrismHub to avoid competing access to the keyboard.

## Risk and provenance

The protocol source reports a permanently damaged keyboard during development and limits its confidence to SK80 units produced in 2023–2024. The label on the user's keyboard does not show a production year or hardware revision. This adapter therefore remains experimental, and compatibility with other firmware revisions is unverified.

Protocol source: https://github.com/TheNotary/keyboard_driver_sk80

License notice: `THIRD_PARTY_NOTICES.md`.
