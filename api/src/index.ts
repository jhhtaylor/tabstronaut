import 'reflect-metadata'
require("dotenv-safe").config();
import express from 'express';
import { DataSource } from "typeorm";
import { __prod__ } from './constants';
import { join } from 'path';
import { User } from "./entities/User";
import { TabGroup } from "./entities/TabGroup";
import { Tab } from "./entities/Tab";
import { Strategy as GitHubStrategy } from "passport-github";
import passport from "passport";
import jwt from "jsonwebtoken";
import cors from "cors";

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
    app.use(cors());
    app.use(express.json());

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
            async (_, __, profile, cb) => {
                let user = await User.findOne({ where: { githubId: profile.id } });
                if (user) {
                    user.name = profile.displayName;
                    await user.save();
                } else {
                    user = await User.create({
                        name: profile.displayName,
                        githubId: profile.id,
                    }).save();
                }
                cb(null, {
                    accessToken: jwt.sign(
                        { userId: user.id },
                        process.env.ACCESS_TOKEN_SECRET,
                        {
                            expiresIn: "1y",
                        }
                    ),
                });
            }
        )
    );

    app.get("/auth/github", passport.authenticate("github", { session: false }));

    app.get(
        "/auth/github/callback",
        passport.authenticate("github", { session: false }),
        (req: any, res) => {
            res.redirect(`http://localhost:54321/auth/${req.user.accessToken}`);
        }
    );

    app.get("/me", async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.send({ user: null });
            return;
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            res.send({ user: null });
            return;
        }

        let userId: number | null = null;

        try {
            const payload: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            userId = parseInt(payload.userId);
        } catch (err) {
            res.send({ user: null });
            return;
        }

        if (!userId) {
            res.send({ user: null });
            return;
        }

        const user = await User.findOne({ where: { id: userId } });

        res.send({ user });

    });

    app.get("/", (_req, res) => {
        res.send("hello");
    });
    app.listen(3002, () => {
        console.log('listening on localhost:3002');
    })

    app.get("/tabGroups", async (req, res) => {

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.send({ user: null });
            return;
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            res.send({ user: null });
            return;
        }

        let userId: number | null = null;

        try {
            const payload: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            userId = parseInt(payload.userId);
        } catch (err) {
            res.send({ user: null });
            return;
        }

        if (!userId) {
            res.send({ user: null });
            return;
        }

        const user = await User.findOne({ where: { id: userId }, relations: ["tabGroup", "tabGroup.tabs"] });

        if (!user) {
            res.send({ user: null });
            return;
        }

        const tabGroupsData = await user.tabGroup;

        const tabGroups = tabGroupsData instanceof Array
            ? await Promise.all(
                tabGroupsData.map(async (group: TabGroup) => {
                    const tabs = await group.tabs;
                    return { ...group, tabs };
                })
            )
            : [];

        res.send({ tabGroups });
    });

    app.post('/tabGroups', async (req, res) => {
        console.log("Received name: ", req.body.name);
        const { name } = req.body;  // Get the name from the request body 

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        let userId: number | null = null;

        try {
            const payload: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            userId = parseInt(payload.userId);
        } catch (err) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        if (!userId) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        const user = await User.findOne({ where: { id: userId } });

        if (!user) {
            res.status(404).send({ message: 'User not found' });
            return;
        }

        // Create new group and associate it with the user
        const newGroup = new TabGroup();
        newGroup.name = name;
        newGroup.creator = Promise.resolve(user);

        await newGroup.save(); // Save new group to DB

        res.status(201).send({ message: 'Tab group created successfully', newGroup });
    });

    app.put('/tabGroups/:groupId', async (req, res) => {
        const groupId = parseInt(req.params.groupId);
        const { tabLabel } = req.body;

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        let userId: number | null = null;

        try {
            const payload: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            userId = parseInt(payload.userId);
        } catch (err) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        if (!userId) {
            res.status(401).send({ message: 'Unauthorized' });
            return;
        }

        const user = await User.findOne({ where: { id: userId } });

        if (!user) {
            res.status(404).send({ message: 'User not found' });
            return;
        }

        const tabGroup = await TabGroup.createQueryBuilder("tabGroup")
            .where("tabGroup.id = :id", { id: groupId })
            .andWhere("tabGroup.creatorId = :creatorId", { creatorId: user.id })
            .getOne();

        if (!tabGroup) {
            res.status(404).send({ message: 'Tab group not found' });
            return;
        }

        // Create new tab and associate it with the tab group
        const newTab = new Tab();
        newTab.name = tabLabel;
        newTab.tabGroup = Promise.resolve(tabGroup);

        await newTab.save(); // Save new tab to DB

        res.status(200).send({ message: 'Tab group updated successfully', tabGroup });
    });

};

main();