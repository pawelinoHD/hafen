#include "globals.h"

#ifdef CHUNK_STORAGE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>

#ifdef _WIN32
  #include <direct.h>
  #define make_dir(path) _mkdir(path)
#else
  #define make_dir(path) mkdir(path, 0755)
#endif

#include "tools.h"
#include "registries.h"
#include "worldgen.h"
#include "serialize.h"
#include "chunks.h"

#define CHUNK_FILE_MAGIC "BIC1"

typedef struct {
  short x;
  short z;
  uint8_t used;
  uint8_t dirty;
  uint32_t last_use;
  uint8_t *blocks;
} ChunkSlot;

static ChunkSlot chunk_cache[CHUNK_CACHE_SIZE];
static ChunkSlot *last_hit = NULL;
static uint32_t use_counter = 0;

// Shared buffer for RLE-encoded chunk data (worst case 2 bytes per block)
static uint8_t rle_buffer[CHUNK_COLUMN_SIZE * 2];

static void getChunkPath (char *out, size_t size, short cx, short cz, const char *suffix) {
  snprintf(out, size, "%s/c.%d.%d.bin%s", CHUNK_DIR, cx, cz, suffix);
}

// Reads a chunk column from disk, returns 1 if it doesn't exist or is invalid
static int readChunkFromDisk (short cx, short cz, uint8_t *blocks) {

  char path[64];
  getChunkPath(path, sizeof(path), cx, cz, "");

  FILE *file = fopen(path, "rb");
  if (!file) return 1;

  char magic[4];
  size_t length = 0;
  if (fread(magic, 1, 4, file) == 4 && memcmp(magic, CHUNK_FILE_MAGIC, 4) == 0) {
    length = fread(rle_buffer, 1, sizeof(rle_buffer), file);
  }
  fclose(file);

  // Decode (count, block) pairs, which have to fill the column exactly
  size_t filled = 0;
  for (size_t i = 0; i + 1 < length; i += 2) {
    uint8_t count = rle_buffer[i];
    if (count == 0 || filled + count > CHUNK_COLUMN_SIZE) break;
    memset(blocks + filled, rle_buffer[i + 1], count);
    filled += count;
  }

  if (filled != CHUNK_COLUMN_SIZE) {
    printf("Chunk file \"%s\" is corrupted, regenerating chunk.\n", path);
    return 1;
  }

  return 0;
}

// Writes a chunk column to disk, using a temporary file to avoid
// leaving a half-written chunk behind if the server is killed
static void writeChunkToDisk (short cx, short cz, uint8_t *blocks) {

  size_t length = 0;
  for (size_t i = 0; i < CHUNK_COLUMN_SIZE;) {
    uint8_t block = blocks[i];
    uint8_t count = 1;
    while (count < 255 && i + count < CHUNK_COLUMN_SIZE && blocks[i + count] == block) count ++;
    rle_buffer[length ++] = count;
    rle_buffer[length ++] = block;
    i += count;
  }

  char path[64], temp_path[64];
  getChunkPath(path, sizeof(path), cx, cz, "");
  getChunkPath(temp_path, sizeof(temp_path), cx, cz, ".tmp");

  FILE *file = fopen(temp_path, "wb");
  if (!file) {
    perror("Failed to open chunk file for writing. Chunk changes have been dropped");
    return;
  }
  size_t written = fwrite(CHUNK_FILE_MAGIC, 1, 4, file);
  written += fwrite(rle_buffer, 1, length, file);
  fclose(file);
  if (written != length + 4) {
    perror("Failed to write chunk file. Chunk changes have been dropped");
    remove(temp_path);
    return;
  }

  #ifdef _WIN32
    // Windows refuses to rename over an existing file
    remove(path);
  #endif
  if (rename(temp_path, path) != 0) {
    perror("Failed to replace chunk file. Chunk changes have been dropped");
  }
}

// Fills a chunk column with freshly generated terrain
static void generateChunk (short cx, short cz, uint8_t *blocks) {
  #ifdef DEV_LOG_CHUNK_GENERATION
    printf("Generating and storing chunk %d, %d\n", cx, cz);
  #endif
  for (int i = 0; i < WORLD_HEIGHT / 16; i ++) {
    buildChunkSection(cx * 16, i * 16, cz * 16);
    // Undo the "big-endian long" reversal done for the network buffer
    uint8_t *section = blocks + (i << 12);
    for (int j = 0; j < 4096; j ++) section[j] = chunk_section[j ^ 7];
  }
}

// Returns the block buffer of a chunk column, loading it from disk or
// generating it if it isn't cached. The returned pointer stays valid
// until the next call that might evict the chunk.
uint8_t *getChunkColumn (short cx, short cz) {

  if (last_hit && last_hit->x == cx && last_hit->z == cz) {
    last_hit->last_use = ++use_counter;
    return last_hit->blocks;
  }

  ChunkSlot *free_slot = NULL, *oldest = NULL;
  for (int i = 0; i < CHUNK_CACHE_SIZE; i ++) {
    ChunkSlot *slot = &chunk_cache[i];
    if (!slot->used) {
      if (!free_slot) free_slot = slot;
      continue;
    }
    if (slot->x == cx && slot->z == cz) {
      slot->last_use = ++use_counter;
      last_hit = slot;
      return slot->blocks;
    }
    if (!oldest || slot->last_use < oldest->last_use) oldest = slot;
  }

  // Not cached - take a free slot, or evict the least recently used one
  ChunkSlot *slot = free_slot;
  if (!slot) {
    slot = oldest;
    if (slot->dirty) writeChunkToDisk(slot->x, slot->z, slot->blocks);
  }
  if (!slot->blocks) {
    slot->blocks = malloc(CHUNK_COLUMN_SIZE);
    if (!slot->blocks) {
      perror("Failed to allocate memory for chunk. Aborting");
      exit(EXIT_FAILURE);
    }
  }

  slot->x = cx;
  slot->z = cz;
  slot->used = true;
  slot->dirty = false;
  slot->last_use = ++use_counter;
  last_hit = slot;

  if (readChunkFromDisk(cx, cz, slot->blocks)) {
    generateChunk(cx, cz, slot->blocks);
    // Newly generated chunks get saved too, so that the world on disk
    // keeps looking the same even if the terrain generator changes
    slot->dirty = true;
  }

  return slot->blocks;
}

uint8_t getStoredBlock (int x, int y, int z) {
  if (y < 0) return B_bedrock;
  if (y >= WORLD_HEIGHT) return B_air;
  uint8_t *blocks = getChunkColumn(div_floor(x, 16), div_floor(z, 16));
  return blocks[(y << 8) | (mod_abs(z, 16) << 4) | mod_abs(x, 16)];
}

void setStoredBlock (int x, int y, int z, uint8_t block) {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  uint8_t *blocks = getChunkColumn(div_floor(x, 16), div_floor(z, 16));
  blocks[(y << 8) | (mod_abs(z, 16) << 4) | mod_abs(x, 16)] = block;
  last_hit->dirty = true;
}

// Writes all modified chunks to disk
void flushChunks () {
  for (int i = 0; i < CHUNK_CACHE_SIZE; i ++) {
    ChunkSlot *slot = &chunk_cache[i];
    if (!slot->used || !slot->dirty) continue;
    writeChunkToDisk(slot->x, slot->z, slot->blocks);
    slot->dirty = false;
  }
}

// Creates the chunk directory and moves block changes from older world
// files into chunks. Chests stay in the block changes array, since their
// item data lives there.
int initChunkStorage () {

  if (make_dir(CHUNK_DIR_PARENT) != 0 && errno != EEXIST) {
    perror("Failed to create world directory. Aborting");
    return 1;
  }
  if (make_dir(CHUNK_DIR) != 0 && errno != EEXIST) {
    perror("Failed to create chunk directory. Aborting");
    return 1;
  }

  int migrated = 0;
  for (int i = 0; i < block_changes_count; i ++) {
    if (block_changes[i].block == 0xFF) continue;
    #ifdef ALLOW_CHESTS
      if (block_changes[i].block == B_chest) {
        setStoredBlock(block_changes[i].x, block_changes[i].y, block_changes[i].z, B_chest);
        i += 14;
        continue;
      }
    #endif
    setStoredBlock(block_changes[i].x, block_changes[i].y, block_changes[i].z, block_changes[i].block);
    block_changes[i].block = 0xFF;
    writeBlockChangesToDisk(i, i);
    migrated ++;
  }

  if (migrated > 0) {
    printf("Moved %d block changes from \"world.bin\" into chunk files.\n\n", migrated);
    flushChunks();
  }

  return 0;
}

#endif
