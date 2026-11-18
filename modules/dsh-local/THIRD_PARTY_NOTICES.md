# Third-party software in `modules/dsh-local`

The "Run on This Device" feature ships these unmodified programs and libraries, taken from the
official Termux aarch64 package repository (packages.termux.dev, checksums verified against the
repository index). They are separate executables/libraries run by the app; the app's own code is MIT.

| File in the APK | Package | Version | Licence | Source |
|---|---|---|---|---|
| `libproot.so` | proot (Termux fork) | 5.1.107.102 | GPL-2.0 | https://github.com/termux/proot/archive/v5.1.107.102.zip |
| `libproot-loader.so` | proot loader (same package) | 5.1.107.102 | GPL-2.0 | same as above |
| `libtalloc.so` | talloc | 2.5.0 | LGPL-3.0-or-later (Termux metadata: GPL-3.0) | https://www.samba.org/ftp/talloc/talloc-2.5.0.tar.gz |
| `libandroid-shmem.so` | libandroid-shmem | 0.7 | BSD-3-Clause (see LICENSE-libandroid-shmem.txt) | https://github.com/termux/libandroid-shmem |

Only change: `libproot.so` and `libtalloc.so` were renamed to fit Android's native-library
naming, and their ELF metadata was adjusted to match (`patchelf`: proot's dependency on
`libtalloc.so.2` → `libtalloc.so`, Termux RUNPATH removed; talloc soname → `libtalloc.so`).
The code is unchanged. Termux build recipes: https://github.com/termux/termux-packages
(`packages/proot`, `packages/libtalloc`, `packages/libandroid-shmem`).

The Linux environment the app downloads (Debian 12 arm64 from images.linuxcontainers.org +
Node.js v24.22.1 from nodejs.org) is published at
https://github.com/mrbeandev/dsh-app/releases/tag/rootfs-debian12-node24-v1 and carries its own
licences (/usr/share/common-licenses, /usr/local/LICENSE).
