import type { Password } from '@/types'
import { compressArray } from '@/utils/compress'

/** Estimate additional entries of the current average size, without fetching vault data. */
export function estimateRemainingPasswords(
  passwords: Password[],
  info: {
    usageKnown?: boolean
    quota: { usedBytes: number; quotaBytes: number; checkFailed?: boolean }
  } | null,
): number | null {
  if (!info || info.usageKnown === false || info.quota.checkFailed) return null
  const { usedBytes, quotaBytes } = info.quota
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 ||
      !Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) return null
  const remaining = quotaBytes - usedBytes
  if (remaining <= 0) return 0
  if (!passwords.length) return null

  // Match the persisted compression format. Only rows (including their commas)
  // grow per entry; the shared field dictionary, envelope, labels and settings
  // must not inflate the average. Recycle-bin entries still occupy storage.
  const compressed = compressArray(passwords)
  const bytes = (value: unknown) => new Blob([JSON.stringify(value)]).size
  const averageRowBytes = (bytes(compressed.dataArray) - 2 + 1) / passwords.length
  const plaintextBytes = bytes(compressed)

  // encryptAES stores CBC/PKCS7 ciphertext as hex: each 16-byte block uses
  // 32 stored bytes. Account for the current padding and complete new blocks.
  // All shared storage is already deducted through actual usedBytes above.
  const paddedBytes = (Math.floor(plaintextBytes / 16) + 1) * 16
  const availablePlaintext = paddedBytes + Math.floor(remaining / 32) * 16 - 1 - plaintextBytes
  return Math.max(0, Math.floor(availablePlaintext / averageRowBytes))
}
