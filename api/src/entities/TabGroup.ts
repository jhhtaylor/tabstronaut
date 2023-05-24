import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "./User";
import { Tab } from "./Tab";

@Entity()
export class TabGroup extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("text")
    name: string;

    @ManyToOne(() => User, (u) => u.tabGroup)
    creator: Promise<User>;

    @OneToMany(() => Tab, (t) => t.tabGroup)
    tabs: Promise<Tab[]>;
}
