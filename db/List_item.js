// list_items is user's shopping list

const { DataTypes } = require("sequelize");

module.exports = (db) => {
    return db.define("list_item", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        inventory_id: {
            type: DataTypes.INTEGER,
            key: "list_item_user",
        },
        user_id: {
            type: DataTypes.INTEGER,
            key: "list_item_user",
        },
        active: DataTypes.BOOLEAN,
        crossed_off: DataTypes.BOOLEAN,
    });
};
