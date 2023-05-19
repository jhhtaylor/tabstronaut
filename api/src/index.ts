import 'reflect-metadata'
require("dotenv-safe").config();
import express from 'express';
import { DataSource } from "typeorm";
import { __prod__ } from './constants';
import { join } from 'path';
import { User } from "./entities/User";
import { Strategy as GitHubStrategy } from "passport-github";
import passport from "passport";
//import jwt from "jsonwebtoken";
//import cors from "cors";

const main = async () => {
    const AppDataSource = new DataSource({
        type: "postgres",
        url: process.env.DATABASE_URI,
        entities: [join(__dirname, "./entities/*.*")],
        logging: !__prod__,
        synchronize: !__prod__,
    });

    try {
        await AppDataSource.initialize();
        console.log(`Data Source has been initialized`);
    } catch (err) {
        console.error(`Data Source initialization error`, err);
    }

    //const user = await AppDataSource.manager.create(User, { name: "bob", githubId: "1" }).save();

    const app = express();

    passport.serializeUser((user: any, done) => {
        done(null, user.accessToken);
    });
    app.use(passport.initialize());

    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL: "http://localhost:3002/auth/github/callback"
            },
            function (_, __, profile, cb) {
                console.log(profile);
                cb(null, { accessToken: '', refreshToken: '' })

            }
        )
    );

    // app.get("/auth/github", passport.authenticate("github", { session: false }));

    // app.get(
    //     "/auth/github/callback",
    //     passport.authenticate("github", { session: false }),
    //     (req: any, res) => {
    //         res.redirect(`http://localhost:54321/auth/${req.user.accessToken}`);
    //     }
    // );

    app.get("/auth/github", passport.authenticate("github", { session: false }));

    app.get(
        "/auth/github/callback",
        passport.authenticate("github", { session: false }),
        (_req, res) => {
            res.send("you logged in correctly");
        }
    );

    app.get("/", (_req, res) => {
        res.send("hello");
    });
    app.listen(3002, () => {
        console.log('listening on localhost:3002');
    })
};

main();