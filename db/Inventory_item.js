// Inventory_item is a grocery item in a store

const {DataTypes} = require("sequelize");

module.exports = (db) => {
    return db.define("inventory_item", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        store_id: DataTypes.INTEGER,
        tile_id: DataTypes.INTEGER,
        item_id: DataTypes.INTEGER,
    });
}