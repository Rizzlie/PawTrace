FROM node:24.16.0-bookworm-slim AS codecs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake ninja-build python3-pip pkg-config curl ca-certificates \
    libglib2.0-dev libexpat1-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
    libexif-dev liblcms2-dev zlib1g-dev \
    && pip3 install --break-system-packages meson==1.9.1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /sources
# Release sources are pinned by version and SHA-256. HEVC encoding is unnecessary.
RUN curl -fsSL https://codeload.github.com/strukturag/libde265/tar.gz/refs/tags/v1.1.3 -o de265.tar.gz \
    && echo '189baa08fd6d2dd34db099de411bd6b2e6bd5eb88e81236a3d0fa3826b9715c4  de265.tar.gz' | sha256sum -c - \
    && tar xzf de265.tar.gz \
    && cmake -S libde265-1.1.3 -B de265-build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/codecs -DENABLE_SDL=OFF -DENABLE_DECODER=OFF -DENABLE_ENCODER=OFF \
    && cmake --build de265-build -j2 && cmake --install de265-build
ENV PKG_CONFIG_PATH=/opt/codecs/lib/pkgconfig LD_LIBRARY_PATH=/opt/codecs/lib
RUN curl -fsSL https://codeload.github.com/strukturag/libheif/tar.gz/refs/tags/v1.23.7 -o heif.tar.gz \
    && echo '90e389caad285ca4946461d56d1c115e56bcbb5141d9038050282af91064fbc7  heif.tar.gz' | sha256sum -c - \
    && tar xzf heif.tar.gz \
    && cmake -S libheif-1.23.7 -B heif-build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/codecs -DCMAKE_INSTALL_LIBDIR=lib \
      -DBUILD_TESTING=OFF -DWITH_EXAMPLES=ON -DWITH_LIBDE265=ON -DWITH_LIBDE265_PLUGIN=OFF \
      -DWITH_X265=OFF -DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=OFF -DWITH_DAV1D=OFF -DWITH_LIBSHARPYUV=OFF \
    && cmake --build heif-build -j2 && cmake --install heif-build
RUN curl -fsSL https://codeload.github.com/libvips/libvips/tar.gz/refs/tags/v8.18.7 -o vips.tar.gz \
    && echo '5024b4b36f20e722c267f4a9bfbdbbafb3b37d48d7125cf425c55bbf76cc9286  vips.tar.gz' | sha256sum -c - \
    && tar xzf vips.tar.gz \
    && meson setup vips-build libvips-8.18.7 --prefix=/opt/codecs --libdir=lib --buildtype=release \
      -Dheif=enabled -Djpeg=enabled -Dpng=enabled -Dwebp=enabled -Dintrospection=disabled -Dexamples=false \
    && meson compile -C vips-build -j2 && meson install -C vips-build
WORKDIR /native
RUN npm install --save-exact sharp@0.35.5 node-addon-api@8.9.2 node-gyp@12.4.0 \
    && npm explore sharp -- npm run build

FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global npm@11.13.0
COPY package.json package-lock.json .npmrc ./
COPY .husky/install.mjs .husky/install.mjs
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NX_DAEMON=false
RUN npx nx run-many -t build -p web api --output-style=static

FROM node:24.16.0-bookworm-slim AS production-dependencies
WORKDIR /app
RUN npm install --global npm@11.13.0
COPY package.json package-lock.json .npmrc ./
COPY .husky/install.mjs .husky/install.mjs
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24.16.0-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libexpat1 libjpeg62-turbo libpng16-16 libwebp7 libwebpdemux2 libwebpmux3 \
    libexif12 liblcms2-2 zlib1g && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000 WEB_ROOT=/app/web LD_LIBRARY_PATH=/opt/codecs/lib
COPY --from=codecs /opt/codecs /opt/codecs
COPY --from=codecs /sources/libde265-1.1.3/libde265/COPYING /opt/codecs/licenses/libde265.txt
COPY --from=codecs /sources/libheif-1.23.7/COPYING /opt/codecs/licenses/libheif.txt
COPY --from=codecs /sources/libheif-1.23.7/examples/COPYING /opt/codecs/licenses/libheif-tools.txt
COPY --from=codecs /sources/libvips-8.18.7/LICENSE /opt/codecs/licenses/libvips.txt
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=codecs /native/node_modules/sharp ./node_modules/sharp
COPY --from=build /app/dist/apps/api ./api
COPY --from=build /app/dist/apps/web/browser ./web
RUN mkdir -p /app/data/assets && chown node:node /app/data/assets
USER node
EXPOSE 3000
CMD ["node", "api/main.js"]
