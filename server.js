// express is a framework for node.js that makes creating a server simpler
// express setup includes (cors, body-parser, bcrypt, sessions)
const express = require("express");
const server = express();

const cors = require("cors");
server.use(
    cors({
        credentials: true,
        origin: [
            "http://localhost:3000",
            "https://dougmr-capstone-frontend.herokuapp.com",
        ],
    })
);

// bodyParser turns incoming body JSON into an object
const bodyParser = require("body-parser");
server.use(bodyParser.json());
const bcrypt = require("bcrypt");

const sessions = require("express-session");
// console.log("server.js, require db.js...");
// DB setup
const {
    db,
    User,
    Tile,
    Tag,
    Store,
    List_item,
    Item,
    Inventory_item,
} = require("./db/db.js");
console.log("db.js imported.");
const SequelizeStore = require("connect-session-sequelize")(sessions.Store);
const oneMonth = 100 * 60 * 60 * 24 * 30;
// use sessions in our express app
server.use(
    sessions({
        secret: "mysecretkey",
        store: new SequelizeStore({ db }),
        cookie: { maxAge: oneMonth },
    })
);

// Op gives us access to SQL operators, like "LIKE, AND, OR, =" etc
const { Op } = require("sequelize");

//
// v Endpoints v
//

const authRequired = (req, res, next) => {
    if (!req.session.user) {
        res.send({ error: "No signed-in User. Access forbidden." });
    } else {
        next();
    }
};

// creates a route, or endpoint, at the specified path "/"
server.get("/", async (req, res) => {
    try {
        res.send("Welcome to my ShopFaster API.");
    } catch (error) {
        console.error(error);
        res.status(500).send({
            error: true,
            errorDetails: error,
            message: "Something went wrong",
        });
    }
});

// -------------
// STORES
// -------------

//
// Get complete store object,
// {name, id, floorPlanImage, entranceTile, checkoutTile, grid[]}
//
server.get("/store/:storeID", async (req, res) => {
    // get id, name, map_url, entrance_tile_id, checkout_tile_id
    const storeEntry = await Store.findOne({
        where: { id: req.params.storeID },
    });
    if (!storeEntry) {
        res.send({ error: "No store by that ID" });
    } else {
        // populate store object
        const store = {
            id: storeEntry.id,
            name: storeEntry.name,
            mapURL: storeEntry.map_url,
            entranceTile: await getTileById(storeEntry.entrance_tile_id),
            checkoutTile: await getTileById(storeEntry.checkout_tile_id),
        };
        // get all the tiles for this store
        const tiles = await getTilesByStoreID(req.params.storeID);
        // console.log("tiles.length: ", tiles.length);

        // arrange tiles into grid array, by col / row
        const grid = [];
        // console.log(tiles[0]);
        // console.log(tiles[0].col);
        let count = 0;
        for (const tile of tiles) {
            // console.log('tile: ',tile);
            if (!Array.isArray(grid[tile.col])) {
                grid[tile.col] = [];
                count++;
            }
            grid[tile.col][tile.row] = tile;
        }
        // console.log("count: ", count);
        // console.log("grid.length: ", grid.length);
        // console.log(grid[0][0]);
        // add neighbors to grid tiles
        setNeighbors(grid);
        // console.log("wn: ", grid[0][0]);

        // add grid to store
        store.grid = grid;

        // send store to front end
        res.send({ store });
    }
});

//
// Get all stores
//
server.get("/stores", async (req, res) => {
    res.send({ stores: await Store.findAll() });
});

//
// Set Store - put the store id in user.current_store_id
//
server.put("/store/:storeID", authRequired, async (req, res) => {
    // console.log("Change user.current_store_id (" + req.params.storeID + ")");
    const dbResponse = await User.update(
        { current_store_id: req.params.storeID },
        { where: { id: req.session.user.id } }
    );
    const user = await User.findOne(
        { where: { id: req.session.user.id } },
        { raw: true }
    );
    // Better place to update req.session.user?
    // ?? THIs doesn't seem to work !!
    req.session.user = user;
    // req.session.user.current_store_id = user.current_store_id;
    // console.log("dbResponse: ", dbResponse);
    // console.log('req.session.user: ',req.session.user);
    // console.log(
    //     "req.session.user.current_store_id: ",
    //     req.session.user.current_store_id
    // );
});

//
// Get current store's id
//
server.get("/current-store-id", authRequired, async (req, res) => {
    // await User.findOne({
    //     where: {
    //         username: req.body.username,
    //         password: bcrypt.hashSync(req.body.password, 10),
    //     },
    // });
    const user = await User.findOne({ where: { id: req.session.user.id } });
    res.send(user.current_store_id);
});

// -------------
// STORE INVENTORY
// -------------

//
// Get Inventory Item by ID - include .item.name and .tile reference
//
server.get("/inventory/item/:itemID", async (req, res) => {
    const dbResult = await Inventory_item.findOne({
        where: { id: req.params.itemID },
        include: [{ model: Item, attributes: ["name"] }, { model: Tile }],
    });
    const item = {
        inventoryID: dbResult.id,
        name: dbResult.item.name,
        tile: dbResult.tile,
    };
    res.send({ item });
});

//
//  Get Inventory for a store by storeID
//
server.get("/store/inventory/:storeID", async (req, res) => {
    // console.log(" .get /store/inventory/:", req.params.storeID);
    const inventory = await Inventory_item.findAll({
        where: {
            store_id: req.params.storeID,
        },
    });
    // console.log("inventory: ", inventory);
    res.send({ inventory });
});

//
// Search Store Inventory for matching item names
//
server.get("/inventory/search/:itemStr", authRequired, async (req, res) => {
    const user = await User.findOne({ where: { id: req.session.user.id } });
    const storeID = user.current_store_id;
    const searchTerms = req.params.itemStr
        .split(" ")
        .map((item) => `%${item}%`);
    // console.log("searchTerms: ", searchTerms);

    // Find all projects with a least one task where task.state === project.state
    const searchResults = await Inventory_item.findAll({
        where: { store_id: storeID },
        include: {
            model: Item,
            attributes: ["name"],
            where: {
                // In Postgres, Op.like/Op.iLike/Op.notLike can be combined to Op.any:

                name: {
                    [Op.iLike]: { [Op.any]: searchTerms },
                },
            },
        },
    });
    const items = [];
    for (const item of searchResults) {
        items.push({ inventoryID: item.id, name: item.item.name });
    }
    // console.log(`inventory/search/${req.params.itemStr}`);
    // console.log("results: ", searchResults);
    res.send({ items });
});

// -------------
// ITEMS
// -------------

//
// Get Item by id
//
server.get("/item/:id", async (req, res) => {
    res.send({
        item: await Item.findOne({
            where: { id: req.params.id },
            include: Tag,
        }),
    });
});

//
// Get All items
//
server.get("/items", async (req, res) => {
    res.send({ items: await Item.findAll() });
});

//
// Search for inventory item/s with similar name in req.session.user.current_store_id
//
server.get("/inventory-items/:name", authRequired, async (req, res) => {
    const searchName = req.params.name;
    const matchingItemIds = [];
    const user = await User.findOne({ where: { id: req.session.user.id } });
    const currentStoreID = user.current_store_id;
    // console.log("searching for inventory-items: ", searchName);
    // 1) search for searchName in items, get a list of item id's
    const matchingItems = await Item.findAll({
        where: {
            name: { [Op.iLike]: `%${searchName}%` },
        },
    });
    for (const item of matchingItems) {
        matchingItemIds.push(item.id);
    }

    // 2) search for searchName in tags, get list of item_id's
    const tagItems = await Tag.findAll({
        where: {
            name: {
                // iLike is insensitive-like (case insensitive)
                [Op.iLike]: `%${searchName}%`,
            },
        },
    });
    for (const tag of tagItems) {
        matchingItemIds.push(tag.item_id);
    }

    // console.log("matchingItemIds: ", matchingItemIds);
    // 3) search inventory_items for each of those id's AND with req.session.user.current_store_id
    const inventoryItems = await Inventory_item.findAll({
        where: {
            id: {
                [Op.in]: matchingItemIds,
            },
            store_id: currentStoreID,
        },
    });

    // 4) return inventoryItems
    res.send({ inventoryItems });
});

//
// Add a new item.  Add new inventory_item.  Maybe add new tags.  Requires name, col, row, storeID, tags.  tags[] optional.
//
server.post("/item", async (req, res) => {
    const name = req.body.name;
    const tags = req.body.tags;
    const col = req.body.col;
    const row = req.body.row;
    const storeID = req.body.storeID;
    // console.log("/item endpoint called: ", req.body.name);

    if (!name) {
        res.send({ error: "Missing Item Name!" });
    } else if (!col) {
        res.send({ error: "Missing Item Col!" });
    } else if (!row) {
        res.send({ error: "Missing Item Row!" });
    } else if (!storeID) {
        res.send({ error: "Missing Store ID!" });
    } else {
        // console.log("checking if item already exists...");
        // check wheter item is already in DB
        const item = await Item.findOne({ where: { name } }, { raw: true });
        // if (item) console.log(name, " already exists");
        if (item) {
            res.send({ itemID: item.id });
            return;
        }
        // console.log(name, " not already in DB");
        // all good, proceed
        const dbResponse = await Item.create({
            name,
        });
        // console.log("dbResponse: ", dbResponse);
        const itemID = dbResponse.id;

        // console.log("attempting item_inventory insert");
        // Add inventory_item to store
        dbResponse = await Inventory_item.create({
            store_id: storeID,
            tile_id: await getTileByStoreIdColRow(storeID, col, row),
            item_id: itemID,
        });
        const inventoryItemID = dbResponse.id;

        // Add tagnames to tags table
        for (const tag of tags) {
            await Tag.create({
                name: tag,
                item_id: itemID,
            });
        }

        res.send({ itemID });
    }
});

//
// Add items.  Add new inventory_items.  Maybe add new tags.  Requires storeID, items[].
//
// Strictly for seeding.
//
server.post("/items", async (req, res) => {
    const items = req.body.items;
    const storeID = req.body.storeID;
    // console.log("/items endpoint called: ", items.length);
    // console.log("items: ", items);

    if (!storeID) {
        res.send({ error: "Missing Store ID!" });
    } else if (!items) {
        res.send({ error: "Missing items array!" });
    } else {
        // items[] esists. Loop through it, adding each item...
        for (const item of items) {
            // Next Item
            // console.log("item: ", item);
            const name = item.name;
            const col = item.loc.x;
            const row = item.loc.y;
            const tags = item.tags ? item.tags : [];
            let itemID;

            // console.log("checking if item ", name, " already exists...");
            // check wheter item is already in DB
            const foundItem = await Item.findOne(
                { where: { name } },
                { raw: true }
            );
            // console.log('foundItem: ',foundItem);
            let foundInventoryItem = null;
            if (foundItem) {
                // console.log(name, " already exists");
                itemID = foundItem.id;
                // Check if inventory item exists
                foundInventoryItem = await Inventory_item.findOne({
                    where: { item_id: itemID, store_id: storeID },
                });
            }
            if (!foundItem) {
                // console.log(name, " not already in DB");
                // all good, proceed
                const dbResponse = await Item.create({
                    name,
                });
                // console.log("dbResponse: ", dbResponse);
                itemID = dbResponse.id;

                // Add tagnames to tags table
                for (const tag of tags) {
                    await Tag.create({
                        name: tag,
                        item_id: itemID,
                    });
                }
            }
            if (!foundItem || !foundInventoryItem) {
                // console.log("attempting item_inventory insert");
                // Add inventory_item to store
                const tile = await getTileByStoreIdColRow(storeID, col, row);
                const tileID = tile.id;
                // console.log("tileID: ", tileID);
                const dbResponse2 = await Inventory_item.create({
                    store_id: storeID,
                    tile_id: tileID,
                    item_id: itemID,
                });
                const inventoryItemID = dbResponse2.id;
                // console.log("inventoryItemID: ", inventoryItemID);
            }
        }

        res.send({ message: "maybe it worked?" });
    }
});

//
//
//

// -------------
// LIST_ITEM
// -------------

//
// Set .active for list_item
//
server.patch(
    "/list-item/active/:itemID/:isActive",
    authRequired,
    async (req, res) => {
        // console.log(
        //     "list-item/active/",
        //     req.params.itemID,
        //     "/",
        //     req.params.isActive
        // );
        // console.log("isActive: ", req.params.isActive);
        await List_item.update(
            { active: req.params.isActive },
            { where: { id: req.params.itemID } }
        );
        // const changedRow = await List_item.findOne(
        //     { where: { id: req.params.itemID } },
        //     {attributes: ["id", "active", "crossed_off"]}
        // );
        // console.log("changedRow: ", changedRow);

        const listItems = await getShoppingList(req.session.user.id);
        res.send({ listItems });
    }
);

//
// Set .active for all list_items
//
server.patch("/list-items/active/:isActive", authRequired, async (req, res) => {
    // console.log("list-items/active/", req.params.isActive);
    const results = await List_item.update(
        { active: req.params.isActive },
        {
            // where: {active: !req.params.isActive}
            // where: {
            //     active: {
            //         [Op.not]: req.params.isActive
            //     }
            // },
            where: { id: { [Op.not]: -1 } },
            // where: { id: 2 },
        }
    );
    // console.log("results: ", results);
    const listItems = await getShoppingList(req.session.user.id);
    res.send({ listItems });
});

//
// Set .crossedOff for list_item
//
server.patch(
    "/list-item/crossed-off/:itemID/:isCrossedOff",
    authRequired,
    async (req, res) => {
        await List_item.update(
            { crossed_off: req.params.isCrossedOff },
            { where: { id: req.params.itemID } }
        );
        const listItems = await getShoppingList(req.session.user.id);
        res.send({ listItems });
    }
);
//
// Set .crossedOff for all list_items
//
server.patch(
    "/list-items/crossed-off/:isCrossedOff",
    authRequired,
    async (req, res) => {
        await List_item.update(
            { crossed_off: req.params.isCrossedOff },
            {
                where: { id: { [Op.not]: -1 } },
            }
        );
        const listItems = await getShoppingList(req.session.user.id);
        res.send({ listItems });
    }
);

//
// Add List_item to list_items
//
server.post("/list-item", authRequired, async (req, res) => {
    const userID = req.session.user.id;
    const inventoryID = req.body.inventoryID;
    if (!inventoryID) {
        res.send({ error: "Missing inventory_id" });
    } else {
        // Don't add if already here
        const found = await List_item.findOne({
            where: [{ inventory_id: inventoryID, user_id: userID }],
        });
        // console.log("FOUND: ", found);
        if (found) {
            res.send({ error: "Item already in shopping list" });
        } else {
            const dbResponse = await List_item.create({
                user_id: userID,
                inventory_id: inventoryID,
            });
            // console.log("New List Item. id: ", dbResponse.id);
            // res.send({ listItems: await List_item.findAll() });
            const listItems = await getShoppingList(req.session.user.id);
            res.send({ listItems });
        }
    }
});

//
// Add multiple List_item to list_items
//
server.post("/list-items", authRequired, async (req, res) => {
    const userID = req.session.user.id;
    const inventoryIDs = req.body.inventoryIDs;
    if (!inventoryIDs) {
        res.send({ error: "Missing inventory_id" });
    } else {
        const items = [];
        for (const id of inventoyIDs) {
            items.push({ user_id: userID, inventory_id: id });
        }
        const dbResponse = await List_item.bulkCreate(items);

        console.log("dbResponse from bulkCreate: ", dbResponse);
        res.send({ listItems: await List_item.findAll() });
    }
});

//
// Get all List_items, as complete objects
//
server.get("/list-items", async (req, res) => {
    // console.log("req.session.user.current_store_id: ",req.session.user.current_store_id);

    const user = await User.findOne({
        where: { id: req.session.user.id },
    });
    // console.log(".get /list-items for store: ", user.current_store_id);
    // console.log("user.storeID: ", user.current_store_id);

    const listItems = await getShoppingList(req.session.user.id);

    // console.log("listItem: ", listItems[0]);
    res.send({ listItems });
});

const getShoppingList = async (userID) => {
    const user = await User.findOne({ where: { id: userID } });
    const storeID = user.current_store_id;
    // console.log("\ngetShoppingList(" + storeID + ")");
    const dbResponse = await List_item.findAll({
        where: { user_id: userID },
        attributes: ["id", "active", "crossed_off"],
        include: [
            {
                model: Inventory_item,
                where: { store_id: storeID },
                attributes: ["id", "store_id"],
                include: [
                    { model: Item, attributes: ["name"] },
                    {
                        model: Tile,
                        attributes: ["id", "column_index", "row_index"],
                    },
                ],
            },
            // nested include's attributes don't work?
        ],
        // raw: true
    });
    // console.log("shopping item: ", dbResponse.toJSON());
    // console.log("db id: ", dbResponse[0].id);
    // console.log("active: ", dbResponse[0].toJSON().active);
    // console.log("db item: ", dbResponse[0].toJSON());

    const listItems = [];
    for (const i of dbResponse) {
        const item = i.toJSON();
        listItems.push({
            listItemID: item.id,
            active: item.active,
            crossedOff: item.crossed_off,
            inventoryID: item.inventory_item.id,
            itemID: item.inventory_item.item.id,
            name: item.inventory_item.item.name,
            // tile: item.inventory_item.tile,
            tileID: item.inventory_item.tile.id,
            col: item.inventory_item.tile.column_index,
            row: item.inventory_item.tile.row_index,
            storeID: item.inventory_item.store_id,
        });
    }
    return listItems;
};
// setTimeout(()=>{
//     getShoppingList();
// },1000);

//
// Delete a List_item
//
server.delete("/list-item/:itemID", authRequired, async (req, res) => {
    await List_item.destroy({ where: { id: req.params.itemID } });
    const listItems = await getShoppingList(req.session.user.id);
    res.send({
        listItems,
        success: true,
        message: "That list_item is GONE",
        listItems,
    });
});

// -------------
// USER
// -------------

//
// Add a new User
//
server.post("/user", async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    if (!username || !password) {
        res.send({ error: "Missing either username or password!" });
    } else {
        const count = await User.count({ where: { username: username } });
        const isUnique = count === 0;
        if (isUnique) {
            createUser(username, password);
            res.send({ success: "Congratulations, User has been created!" });
        } else {
            res.send({ error: "Username is not unique!" });
        }
    }
});

//
// Log In User
//
server.post("/login", async (req, res) => {
    //
    console.log("looking for user...", req.body);
    // const users = await User.findAll();
    // console.log("users: ",users);
    const user = await User.findOne(
        { where: { username: req.body.username } },
        { raw: true }
    );
    
    if (!user) {
        console.log("/login - Username not found.")
        res.send({ error: "username not found" });
    } else {
        const matchingPassword = await bcrypt.compare(
            req.body.password,
            user.password
        );
        if (matchingPassword) {
            req.session.user = user;
            console.log('/login - success. username/password match.  req.session.user: ',req.session.user);
            console.log(
                "/login Logged in.  req.session.user: ",
                req.session.user
            );
            res.send({
                success: true,
                message: "open sesame!",
                storeID: user.current_store_id,
            });
        } else {
            console.log('/login - password does not match');
            res.send({
                error: "no good.  Found user, but password does not match!",
            });
        }
    }
    // console.log("logged in.  req.session: ", req.session);
});

//
// Login Status
//
server.get("/loginStatus", async (req, res) => {
    console.log("/loginStatus, req.session.user: ", req.session.user);
    if (req.session.user) {
        console.log("loginStatus: Logged in!");
        const user = await User.findOne({ where: { id: req.session.user.id } });
        // make sure req.session.user.current_store_id is current
        req.session.user = user; 
        res.send({
            isLoggedIn: true,
            storeID: user.current_store_id,
        });
    } else {
        console.log("loginStatus: Not Logged In.");
        res.send({ isLoggedIn: false });
    }
});


// -------------
// TILES
// -------------

//
// Add a Tile to tiles
//
server.post("/tile", async (req, res) => {
    const col = req.body.col;
    const row = req.body.row;
    const obstacle = req.body.obstacle;
    const store_id = req.body.storeID;

    // Should we give each of these its own else if, so we can return a more specific error?
    if (!col) {
        res.send({ error: "Missing .col property!" });
    } else if (!row) {
        res.send({ error: "Missing .row property!" });
    } else if (!obstacle) {
        res.send({ error: "Missing .obstacle property!" });
    } else if (!store_id) {
        res.send({ error: "Missing .storeID property!" });
    } else {
        // all properties present
        // is this storeID / col / row already in tiles table?
        const count = await Tile.count({
            where: { store_id: store_id, column_index: col, row_index: row },
        });
        const isUnique = count === 0;
        if (isUnique) {
            // Add to table
            const tileID = await Tile.create({
                store_id: store_id,
                column_index: col,
                row_index: row,
                obstacle: obstacle,
            });
            res.send({ tileID: tileID });
        } else {
            res.send({ error: "Tile description already in DB!" });
        }
    }
});

//
// Add Multiple tiles
//
server.post("/tiles", async (req, res) => {
    const tiles = req.body.tiles;
    console.log("server.js adding ", tiles.length, " tiles to DB");
    // How do I check if each item in the array has correct properties for filling table's columns?

    const response = await Tile.bulkCreate(tiles);
    res.send(response);
});

//
// Get all tiles for a store
//
server.get("/tiles/:storeID", async (req, res) => {
    const tiles = getTilesByStoreID(req.params.storeID);
    res.send({ tiles });
});
//
// Get tile by store, col, row
//
server.get("/tile/:storeID/:col/:row", async (req, res) => {
    const tile = await Tile.findOne({
        where: {
            store_id: req.params.storeID,
            column_index: req.params.col,
            row_index: req.params.row,
        },
        attributes: [
            "id",
            ["store_id", "storeID"],
            ["column_index", "col"],
            ["row_index", "row"],
            "obstacle",
        ],
        // raw: true,
        // nest: true,
    });
    res.send({ tile });
});

//
// Set Neighbors for all Tiles in a grid
//
const setNeighbors = (grid) => {
    // Set Neighbors for each Tile
    // Grid must be built befoe we can call this
    for (const col of grid) {
        for (const tile of col) {
            // Get Neighbors
            tile.neighbors = getNeighborTiles(tile, grid);
        }
    }
};
const getNeighborTiles = (tile, grid) => {
    // 0 - 7 clockwise, starting above
    const numRows = grid[0].length;
    const numCols = grid.length;
    const x = tile.col;
    const y = tile.row;
    const neighbors = [];
    const add = (col, row) => {
        if (col < 0 || col >= numCols || row < 0 || row >= numRows) {
            neighbors.push(null);
        } else {
            // neighbors.push(grid[col][row]);
            // just make neighbor a reference to col / row
            neighbors.push({ col, row });
        }
    };
    // Above (0)
    add(x, y - 1);
    // Top Right (1)
    add(x + 1, y - 1);
    // Right (2)
    add(x + 1, y);
    // Bottom Right (3)
    add(x + 1, y + 1);
    // Bottom (4)
    add(x, y + 1);
    // Bottom Left (5)
    add(x - 1, y + 1);
    // Left (6)
    add(x - 1, y);
    // Top Left(7)
    add(x - 1, y - 1);
    return neighbors;
};

//
// ^ Endpoints ^
//

// tell server to listen on port 3001
// according to geeksforgeeks.org/express-js-app-listen-function/, the 2nd parameter specifies a function that will get executed, once your app starts listening to specified port

// if heroku, process.env.PORT will be provided
let port = process.env.PORT;
if (!port) {
    port = 3001;
}
server.listen(port, () => {
    console.log("Server running.  It's alive!!");
});

const getTilesByStoreID = async (storeID) => {
    return await Tile.findAll({
        where: { store_id: storeID },
        attributes: [
            "id",
            ["store_id", "storeID"],
            ["column_index", "col"],
            ["row_index", "row"],
            "obstacle",
        ],
        raw: true,
        // nest: true,
    });
};

// Get Inventory_items for a store
const getStoreInventory = async (storeID) => {
    // Example of searching row by name
    const items = await Inventory_item.findAll({
        where: {
            store_id: storeID,
        },
    });

    // storeID: 1,
    // name: "Fresh Mart",
    // floorPlanImage: "grocery-store-layout.png",
    // tileSize: 20.382978723404257,
    // numRows: 44,
    // numColumns: 47,
    // entranceTile: { col: 42, row: 42 },
    // checkoutTile: { col: 25, row: 35 },
    // grid: []
    return items;
};

const createUser = async (username, password) => {
    User.create({
        username,
        password: bcrypt.hashSync(password, 10),
    });
};

const getTileByStoreIdColRow = async (storeID, col, row) => {
    const tile = await Tile.findOne({
        where: {
            store_id: storeID,
            column_index: col,
            row_index: row,
        },
        attributes: [
            "id",
            ["store_id", "storeID"],
            ["column_index", "col"],
            ["row_index", "row"],
            "obstacle",
        ],
        raw: true,
        nest: true,
    });
    return tile;
};

const getTileById = async (tileID) => {
    const tile = await Tile.findOne({
        where: { id: tileID },
        attributes: [
            "id",
            ["store_id", "storeID"],
            ["column_index", "col"],
            ["row_index", "row"],
            "obstacle",
        ],
        raw: true,
        nest: true,
    });
    return tile;
};

//
// SEEDING the DB...
//

const createFirstUser = async () => {
    console.log("createFirstUser()");
    const users = await User.findAll();
    console.log("***** users: ", users);
    if (users.length === 0) {
        User.create({
            username: "Doug R",
            password: bcrypt.hashSync("secretpassword", 10),
            current_store_id: 1,
        });
    }
};

// createFirstUser();

// const test = async () => {
//     const stores = await Store.findAll();
//     console.log('stores: ',stores.length);
//     const tags = await Tag.findAll();
//     console.log('tags: ',tags.length);
//     const listItems = await List_item.findAll();
//     console.log("listItems: ",listItems.length);
//     const users = await User.findAll();
//     console.log('users: ', users);
// }
// test();
//
// Create Stores, requires tiles already populated
//
const createStore = async (
    storeID,
    storeName,
    mapURL,
    entranceTileObj,
    checkoutTileObj
) => {
    const entranceTile = await getTileByStoreIdColRow(
        storeID,
        entranceTileObj.col,
        entranceTileObj.row
    );
    const checkoutTile = await getTileByStoreIdColRow(
        storeID,
        checkoutTileObj.col,
        checkoutTileObj.row
    );

    Store.create({
        name: storeName,
        map_url: mapURL,
        entrance_tile_id: entranceTile.id,
        checkout_tile_id: checkoutTile.id,
    });
};

// createStore(1,"Fresh Mart", "grocery-store-layout.png",{ col: 42, row: 42 }, { col: 25, row: 35 });
// createStore(2,"James St Wegmans", "JamesStWegmans_floorplan-store-layout.png",{ col: 103, row: 92 }, { col: 76, row: 80 });
// comment for new commit
