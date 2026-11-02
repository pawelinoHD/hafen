# Erweiterte bareiron-Fassung (Sichtweite 6, gespeicherte Chunks, 32 Spieler, 64 Mobs, 4 Ticks/s)
# aus dem mitgelieferten Quellcode bauen – auf jeder Architektur, also auch arm64 (M1).
# Die Registries für Minecraft 1.21.8 liegen bereits erzeugt bei, darum braucht es hier weder Java noch Mojang-Downloads.

FROM ubuntu:24.04 AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY source/ .
RUN test -f include/registries.h && test -f src/registries.c \
 && gcc -O2 -Iinclude -o bareiron src/*.c -lm

# Nur das kleine Programm landet im Image
FROM ubuntu:24.04
COPY --from=build /src/bareiron /usr/local/bin/bareiron
# Welt: world.bin (Spieler, Truhen) und world/chunks/ – beides im Arbeitsverzeichnis
WORKDIR /data
EXPOSE 25565
CMD ["bareiron"]
