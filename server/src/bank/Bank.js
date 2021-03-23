const settings = require("../../settings.js");
const EventsList = require("../EventsList.js");
const ItemConfig = require("../inventory/ItemConfig.js");
const BankChest = require("../entities/statics/interactables/breakables/BankChest");
const Utils = require("../Utils.js");

class Bank {
    constructor(owner) {
        this.owner = owner;

        this.weight = 0;

        this.maxWeight = settings.MAX_BANK_WEIGHT || 1000;

        this.maxWeightUpgradeCost = (
            this.maxWeight * settings.MAX_BANK_WEIGHT_UPGRADE_COST_MULTIPLIER
        );

        /**
         * A list of the items in this bank account.
         * Only contains item configs for potential items, NOT actual Item class instances,
         * as they cannot be used, equipped etc. directly while in the bank.
         * @type {Array.<ItemConfig>}
         */
        this.items = [];
    }

    print() {
        console.log("printing bank:");
        this.items.forEach((item) => {
            console.log(item);
        });
    }

    buyMaxWeightUpgrade() {
        // Check the player has enough glory.
        if (this.owner.glory < this.maxWeightUpgradeCost) return;

        this.owner.modGlory(-this.maxWeightUpgradeCost);

        this.maxWeight += settings.ADDITIONAL_MAX_BANK_WEIGHT_PER_UPGRADE;

        // Tell the player their new max bank weight.
        this.owner.socket.sendEvent(EventsList.bank_max_weight, this.maxWeight);

        // Update the next cost based on the new max weight.
        this.maxWeightUpgradeCost = (
            this.maxWeight * settings.MAX_BANK_WEIGHT_UPGRADE_COST_MULTIPLIER
        );

        // Tell the player the next upgrade cost.
        this.owner.socket.sendEvent(
            EventsList.bank_max_weight_upgrade_cost,
            this.maxWeightUpgradeCost,
        );
    }

    /**
     * Returns all of the items in this bank, in a form that is ready to be emitted.
     * @returns {Object}
     */
    getEmittableProperties() {
        const emittableInventory = {
            weight: this.weight,
            maxWeight: this.maxWeight,
            maxWeightUpgradeCost: this.maxWeightUpgradeCost,
            items: [],
        };

        return emittableInventory;
    }

    updateWeight() {
        const originalWeight = this.weight;
        this.weight = 0;

        this.items.forEach((item) => {
            this.weight += item.totalWeight;
        });

        // Only send if it has changed.
        if (this.weight !== originalWeight) {
            // Tell the player their new bank weight.
            this.owner.socket.sendEvent(EventsList.bank_weight, this.weight);
        }
    }

    findNonFullItemTypeStack(ItemType) {
        let slotIndex = null;
        const nonFullStack = this.items.find((item, index) => {
            if ((item.ItemType === ItemType)
            // Also check if the stack is not already full.
            && (item.quantity < item.MAX_QUANTITY)) {
                slotIndex = index;
                return true;
            }
            return false;
        });

        return {
            nonFullStack,
            slotIndex,
        };
    }

    addStackable(itemConfig) {
        // Find if a stack for this type of item already exists.
        let { nonFullStack, slotIndex } = this.findNonFullItemTypeStack(itemConfig.ItemType);

        while (nonFullStack) {
            // Check there is enough space left in the stack to add these additional ones.
            if ((nonFullStack.quantity + itemConfig.quantity) > nonFullStack.MAX_QUANTITY) {
                // Not enough space. Add what can be added and keep the rest where it is, to then
                // see if another stack of the same type exists that it can be added to instead.

                const availableQuantity = (
                    nonFullStack.MAX_QUANTITY - nonFullStack.quantity
                );

                // Add to the found stack.
                nonFullStack.modQuantity(+availableQuantity);

                // Tell the player the new quantity of the found stack.
                this.owner.socket.sendEvent(
                    EventsList.modify_bank_item,
                    {
                        slotIndex,
                        quantity: nonFullStack.quantity,
                        totalWeight: nonFullStack.totalWeight,
                    },
                );

                // Some of the quantity to add has now been added to an existing stack, so reduce the amount
                // that will go into any other stacks, or into the new overflow stack if no other stack exists.
                itemConfig.modQuantity(-availableQuantity);

                // Check if there are any other non full stacks that the remainder can be added to.
                ({ nonFullStack, slotIndex } = this.findNonFullItemTypeStack(itemConfig.ItemType));
            }
            else {
                // Enough space. Add them all.
                nonFullStack.modQuantity(+itemConfig.quantity);

                // Tell the player the new quantity of the existing stack.
                this.owner.socket.sendEvent(
                    EventsList.modify_bank_item,
                    {
                        slotIndex,
                        quantity: nonFullStack.quantity,
                        totalWeight: nonFullStack.totalWeight,
                    },
                );

                // Reduce the size of the incoming stack.
                itemConfig.modQuantity(-itemConfig.quantity);

                this.updateWeight();

                // Nothing left to move.
                return;
            }
        }

        // Check if there is anything left to add after all of the existing stacks have been filled.
        if (itemConfig.quantity > 0) {
            // Some left to add. Add it as a new stack.
            const newSlotIndex = this.items.length;

            this.items.push(itemConfig);

            // Tell the player a new item was added to their bank.
            this.owner.socket.sendEvent(EventsList.add_bank_item, {
                slotIndex: newSlotIndex,
                typeCode: itemConfig.ItemType.prototype.typeCode,
                id: itemConfig.id,
                quantity: itemConfig.quantity,
                totalWeight: itemConfig.totalWeight,
            });
        }
    }

    /**
     * @param {Number} inventorySlotIndex
     * @param {Number} quantityToDeposit - Stackables only. How much of the stack to deposit.
     */
    depositItem(inventorySlotIndex, quantityToDeposit) {
        /** @type {Item} The inventory item to deposit. */
        const inventoryItem = this.owner.inventory.items[inventorySlotIndex];
        if (!inventoryItem) return;

        const depositItemConfig = new ItemConfig({
            ItemType: inventoryItem.itemConfig.ItemType,
            quantity: quantityToDeposit, // Need to check the actual amount to deposit, as they might not want to add all of it.
            durability: inventoryItem.itemConfig.durability,
            maxDurability: inventoryItem.itemConfig.maxDurability,
        });

        // Check they are next to a bank terminal.
        if (!this.owner.isAdjacentToStaticType(BankChest.prototype.typeNumber)) return;

        // Check there is enough space to store all of the desired amount to deposit.
        // Should be done on the client, but double-check here too.
        if ((this.weight + depositItemConfig.totalWeight) > this.maxWeight) return;

        // Add if stackable.
        if (inventoryItem.itemConfig.ItemType.prototype.baseQuantity) {
            // When depositing a stackable, a quantity must be provided.
            if (!quantityToDeposit) return;

            // Check the quantity to deposit is not more than the amount in the stack.
            if (quantityToDeposit > inventoryItem.itemConfig.quantity) return;

            this.addStackable(depositItemConfig);

            // All of the stack should have been added, so now remove it from the inventory.
            this.owner.inventory.removeQuantityFromSlot(
                inventorySlotIndex,
                quantityToDeposit,
            );
        }
        // Add unstackable.
        else {
            // When depositing an unstackable, a quantity must not be provided.
            if (quantityToDeposit) return;

            const slotIndex = this.items.length;

            // Store the item config in the bank.
            this.items.push(depositItemConfig);

            // Remove it from the inventory.
            this.owner.inventory.removeItemBySlotIndex(inventorySlotIndex);

            // Tell the player a new item was added to their bank.
            this.owner.socket.sendEvent(EventsList.add_bank_item, {
                slotIndex,
                typeCode: depositItemConfig.ItemType.prototype.typeCode,
                id: depositItemConfig.id,
                durability: depositItemConfig.durability,
                maxDurability: depositItemConfig.maxDurability,
                totalWeight: depositItemConfig.totalWeight,
            });
        }

        this.updateWeight();
    }

    /**
     *
     * @param {ItemConfig} config
     */
    addItem(config, quantity) {
        // if (!(config instanceof ItemConfig)) {
        //     throw new Error("Cannot add item to bank from a config that is not an instance of ItemConfig. Config:", config);
        // }

        // if (config.quantity) {
        //     const quantityToAdd = this.quantityThatCanBeAdded(config);

        // // Find if a stack for this type of item already exists.
        // const found = this.items.find((item) => (
        //     (item instanceof config.ItemType)
        //     // Also check if the stack is not already full.
        //     && (item.quantity < item.MAX_QUANTITY)
        // ));

        // // Add to the existing stack.
        // if (found) {
        //     // Check there is enough space left in the stack to add these additional ones.
        //     if ((found.itemConfig.quantity + quantityToAdd) > found.itemConfig.MAX_QUANTITY) {
        //         // Not enough space. Add what can be added and keep the rest where it is.

        //         const availableQuantity = (
        //             found.itemConfig.MAX_QUANTITY - found.itemConfig.quantity
        //         );

        //         // Add to the found stack.
        //         found.modQuantity(+availableQuantity);

        //         // Some of the quantity to add has now been added to an existing stack,
        //         // so reduce the amount that will go into the new overflow stack.
        //         quantityToAdd -= availableQuantity;
        //     }
        //     else {
        //         // Enough space. Add them all.
        //         found.modQuantity(+quantityToAdd);

        //         // Reduce the size of the incoming stack.
        //         config.modQuantity(-quantityToAdd);

        //         this.updateWeight();
        //         // Don't want to add another item below, so exit now.
        //         return;
        //     }
        // }

        // Reduce the size of the incoming stack.
        // config.modQuantity(-quantityToAdd);

        // const slotIndex = this.items.length;

        // // Make a new stack with just the quantity that can fit in the available weight.
        // const item = new ItemConfig({
        //     ItemType: config.ItemType,
        //     quantity: quantityToAdd,
        // });

        // this.items.push(item);

        // // Tell the player a new item was added to their bank.
        // this.owner.socket.sendEvent(EventsList.add_bank_item, {
        //     slotIndex,
        //     typeCode: item.typeCode,
        //     id: item.itemConfig.id,
        //     quantity: item.itemConfig.quantity,
        //     totalWeight: item.itemConfig.totalWeight,
        // });

        // If it is a stackable, check if there is any of the stack left in the inventory.
        //     if (quantity && inventoryItem.itemConfig.quantity < 1) {
        //         this.inventory.removeQuantityByItemType(
        //             quantity,
        //             inventoryItem.itemConfig.ItemType,
        //         );
        //     }
        // }
        // Add as an unstackable.
        // else {
        //     const slotIndex = this.items.length;

        //     // Add the item to the bank as a new entry as an unstackable.
        //     this.items.push(config);

        //     // Tell the player a new item was added to their bank.
        //     this.owner.socket.sendEvent(EventsList.add_bank_item, {
        //         slotIndex,
        //         typeCode: config.typeCode,
        //         id: config.itemConfig.id,
        //         durability: config.itemConfig.durability,
        //         maxDurability: config.itemConfig.maxDurability,
        //         totalWeight: config.itemConfig.totalWeight,
        //     });
        // }

        // this.updateWeight();
    }

    removeItemBySlotIndex(slotIndex) {
        if (!this.items[slotIndex]) return;

        // Remove it and squash the hole it left behind.
        // The items list shouldn't be holey.
        this.items.splice(slotIndex, 1);

        // Tell the player the item was removed from their bank.
        this.owner.socket.sendEvent(EventsList.remove_bank_item, slotIndex);
    }

    removeQuantityByItemType(quantity, ItemType) {
        // Check it is actually a stackable.
        if (!ItemType.prototype.baseQuantity) return;

        // Find an item in the bank of the given type.
        const foundIndex = this.items.findIndex((item) => item.ItemType === ItemType);

        const foundItem = this.items[foundIndex];

        if (!foundItem) return;

        // Reduce the quantity.
        foundItem.modQuantity(-quantity);

        // Check if there is anything left in the stack.
        if (foundItem.quantity < 1) {
            this.removeItemBySlotIndex(foundIndex);
        }

        this.updateWeight();
    }
}

module.exports = Bank;