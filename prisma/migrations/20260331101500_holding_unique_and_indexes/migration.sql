-- Cleanup duplicated holdings before adding unique constraint.
-- Keep the latest row by updatedAt/createdAt/id for each (userId, accountId, fundId).
DELETE h
FROM `Holding` h
INNER JOIN `Holding` h2
  ON h.`userId` = h2.`userId`
  AND h.`fundId` = h2.`fundId`
  AND ((h.`accountId` = h2.`accountId`) OR (h.`accountId` IS NULL AND h2.`accountId` IS NULL))
  AND (
    h.`updatedAt` < h2.`updatedAt`
    OR (h.`updatedAt` = h2.`updatedAt` AND h.`createdAt` < h2.`createdAt`)
    OR (h.`updatedAt` = h2.`updatedAt` AND h.`createdAt` = h2.`createdAt` AND h.`id` < h2.`id`)
  );

-- Add unique constraint and query indexes for holdings.
CREATE UNIQUE INDEX `Holding_userId_accountId_fundId_key` ON `Holding`(`userId`, `accountId`, `fundId`);
CREATE INDEX `Holding_userId_accountId_idx` ON `Holding`(`userId`, `accountId`);
CREATE INDEX `Holding_userId_sortOrder_idx` ON `Holding`(`userId`, `sortOrder`);
