#ifndef H_CHUNKS
#define H_CHUNKS

#include <stdint.h>

#include "globals.h"

#ifdef CHUNK_STORAGE

// World height covered by stored chunks (Y = 0 to 319)
#define WORLD_HEIGHT 320

// Bytes per stored chunk column, one byte per block
// Indexed as (y << 8) | (z << 4) | x
#define CHUNK_COLUMN_SIZE (WORLD_HEIGHT * 256)

int initChunkStorage ();
uint8_t *getChunkColumn (short cx, short cz);
uint8_t getStoredBlock (int x, int y, int z);
void setStoredBlock (int x, int y, int z, uint8_t block);
void flushChunks ();

#else
  #define initChunkStorage() 0
  #define flushChunks()
#endif

#endif
