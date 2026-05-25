const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const storageRoutes = require("./storage-routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/storage", storageRoutes);

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "myserver"
});

db.connect((err) => {

    if (err) {
        console.log(err);
        return;
    }

    console.log("MySQL Connected");
});

app.get("/", (req, res) => {
    res.send("Server Online OK");
});

app.post("/save", (req, res) => {

    const message = req.body.message;

    db.query(
        "INSERT INTO logs(message) VALUES(?)",
        [message],
        (err, result) => {

            if (err) {
                console.log(err);

                return res.json({
                    success: false
                });
            }

            res.json({
                success: true
            });
        }
    );
});

app.get("/logs", (req, res) => {

    db.query(
        "SELECT * FROM logs ORDER BY id DESC",
        (err, result) => {

            if (err) {
                return res.json([]);
            }

            res.json(result);
        }
    );
});

app.listen(3000, () => {
    console.log("API Running Port 3000");
});