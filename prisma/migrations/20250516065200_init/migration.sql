-- CreateTable
CREATE TABLE `Block` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockNumber` INTEGER NOT NULL,
    `blockHash` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `parentHash` VARCHAR(191) NOT NULL,
    `gasUsed` VARCHAR(191) NOT NULL,
    `gasLimit` VARCHAR(191) NOT NULL,
    `baseFeePerGas` VARCHAR(191) NULL,
    `miner` VARCHAR(191) NOT NULL,
    `trxNumber` INTEGER NOT NULL,
    `transactions` JSON NOT NULL,
    `receipts` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Block_blockNumber_key`(`blockNumber`),
    UNIQUE INDEX `Block_blockHash_key`(`blockHash`),
    INDEX `Block_blockNumber_idx`(`blockNumber`),
    INDEX `Block_blockHash_idx`(`blockHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
