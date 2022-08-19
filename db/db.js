
// Sequelize lets us run SQL queries without writing SQL,
// This protects us from SQL injections
const Sequelize = require("sequelize");

// Point to the db
let options = {};
// if on heroku, there will be process.env, with property DATABASE_URL
let databaseURL = process.env.DATABASE_URL;
if (!databaseURL) {
    // we're on localhost
    databaseURL = "postgres://dougroussin@localhost:5432/shop_faster";
    options = {
        logging: false,
    };
} else {
    // we're not on localhost
    options = {
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
        },
    };
}



const db = new Sequelize(databaseURL, options);
// const db = new Sequelize("postgres://dougroussin@localhost:5432/shop_faster", 
// {logging: false});
// {logging: console.log});
const User = require("./User")(db);
const Inventory_item = require("./Inventory_item")(db);
const Item = require("./Item")(db);
const List_item = require("./List_item")(db);
// const List_item = require("./Shopping_list_item")(db);
const Store = require("./Store")(db);
const Tag = require("./Tag")(db);
const Tile = require("./Tile")(db);

const connectTODB = async () => {
    try {
        await db.authenticate();
        console.log("Connected Successfully to db");
        db.sync({force: false});
    } catch (error) {
        console.error(error);
        console.error(`DB connection failed. Time to panic!`);
    }

    // What is this? Do we need to define associations between tables?
    Item.hasMany(Tag, {foreignKey:"item_id" })
    Inventory_item.belongsTo(Item, { foreignKey: "item_id" });
    Inventory_item.belongsTo(Tile, { foreignKey: "tile_id" });
    List_item.belongsTo(Inventory_item, { foreignKey: "inventory_id" });
};

connectTODB();

module.exports = { db, User, Inventory_item, Item, List_item, Store, Tag, Tile };
