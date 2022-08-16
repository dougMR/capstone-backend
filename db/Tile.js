// Tile is a grid square in a Store.

const { DataTypes } = require("sequelize");

module.exports = (db) => {
    return db.define("tile", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        store_id: DataTypes.INTEGER,
        
        column_index: DataTypes.INTEGER,
        
        row_index: DataTypes.INTEGER,
        
        obstacle: DataTypes.BOOLEAN,
    });
};
