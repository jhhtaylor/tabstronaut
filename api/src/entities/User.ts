import {
    BaseEntity,
    Column,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
  } from "typeorm";

  import { TabGroup } from "./TabGroup";
  
  @Entity()
  export class User extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column("text", { nullable: true })
    name: string;
  
    @Column("text", { unique: true })
    githubId: string;
  
    @OneToMany(() => TabGroup, (t) => t.creator)
    tabGroup: Promise<TabGroup[]>;
  }
  