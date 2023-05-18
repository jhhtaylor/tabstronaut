import 'reflect-metadata'
import express from 'express';
import { DataSource } from "typeorm";
import { __prod__ } from './constants';
import { join } from 'path';
import dotenv from "dotenv";

dotenv.config();

const main = async () => {
    const conn = new DataSource({
        type: "postgres",
        url: process.env.DATABASE_URI,
        entities: [join(__dirname), "./entities/*.*"],
        logging: !__prod__,
        synchronize: !__prod__,
    });

    conn
        .initialize()
        .then(() => {
            console.log(`Data Source has been initialized`);
        })
        .catch((err) => {
            console.error(`Data Source initialization error`, err);
        })

    const app = express();
    app.get("/", (_req, res) => {
        res.send("hello");
    });
    app.listen(3002, () => {
        console.log('listening on localhost:3002');
    })
};

main();