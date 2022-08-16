// Tag is an alternative name for an item. Items can have multiple Tags.

const {DataTypes} = require("sequelize");

module.exports = (db) => {
    return db.define("tag", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: DataTypes.STRING,
        item_id: DataTypes.INTEGER,
    });
}