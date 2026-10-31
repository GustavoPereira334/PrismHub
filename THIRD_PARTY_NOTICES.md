# Third-party notices

## Bundled Windows runtime

The Windows installer aggregates the unmodified official OpenRGB 1.1 engine (release commit 8e16de2), an independent process controlled via its documented SDK. OpenRGB is GPL-2.0-or-later, Copyright Adam Honse and contributors: https://codeberg.org/OpenRGB/OpenRGB . Its license, source archive, original project/build configuration, and dependency source archives are installed under resources/licensing. Runtime URLs, versions and SHA256 are in packaging/runtime-manifest.json (also included in that directory).

The official engine includes dynamically linked Qt 6.8.3 (QtBase and Qt5Compat, LGPL-3.0 with applicable exceptions or other upstream module licenses), libusb 1.0.27 (LGPL-2.1-or-later), hidapi-hotplug (HIDAPI's BSD/GPLv3/original HIDAPI license alternatives), Microsoft DirectX shader runtime components and PawnIO libraries/modules. These remain unmodified and retain their upstream terms. Qt and libusb source archives, including their license texts, accompany this distribution. The original OpenRGB source archive includes its dependencies and build inputs. Additional HIDAPI hotplug sources and licensing: https://codeberg.org/OpenRGB/hidapi-hotplug . DirectX Shader Compiler sources/licensing: https://github.com/microsoft/DirectXShaderCompiler . Qt shared libraries remain replaceable; debugging modifications to LGPL components is permitted.

PawnIO official signed installer 2.2.0 is redistributed unmodified as permitted by its installer notice. It is installed only when the driver is absent, and never automatically removed because other applications may use it. Official site: https://pawnio.eu/ ; release: https://github.com/namazso/PawnIO.Setup/releases/tag/2.2.0 . The unrestricted unsigned edition is not selected.

Electron includes Chromium, Node.js and their third-party components. The packaged Electron runtime provides LICENSE.electron.txt and LICENSES.chromium.html. PrismHub's native Node dependencies retain their license files in the application resources. Bundled sources and notices describe the independent components; they do not promise hardware compatibility.

The Attack Shark X11 HID report implementation was independently written from the protocol documentation published by the `attack-shark-x11-community-driver` project (MIT License, copyright HarukaYamamoto0).

Reference: https://github.com/akawazak/attack-shark-x11-community-driver

The runtime HID transport uses `node-hid`, distributed under the MIT or X11 license.
The Windows HID feature transport uses `koffi` 3.3.3 (MIT License): https://github.com/Koromix/koffi
The Womier SK80 adapter uses protocol research from `TheNotary/keyboard_driver_sk80`:
https://github.com/TheNotary/keyboard_driver_sk80

Copyright (c) 2024 TheNotary

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
