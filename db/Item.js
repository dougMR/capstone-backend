// Item is a grocery item

const { DataTypes } = require("sequelize");

module.exports = (db) => {
    return db.define("item", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: DataTypes.STRING
    });
};
