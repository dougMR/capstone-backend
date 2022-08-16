// Store is a... well, store.

const {DataTypes} = require("sequelize");

module.exports = (db) => {
    return db.define("store", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: DataTypes.STRING,
        map_url: DataTypes.STRING,
        entrance_tile_id: DataTypes.INTEGER,
        checkout_tile_id: DataTypes.INTEGER,
    });
}