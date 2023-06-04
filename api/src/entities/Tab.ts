import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";

import { TabGroup } from "./TabGroup";

@Entity()
export class Tab extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("text")
    name: string;

    @ManyToOne(() => TabGroup, (t) => t.tabs, { cascade: ['insert', 'update'] })
    tabGroup: Promise<TabGroup>;
}
