import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { usuarios } from "../db/schema";

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  findByEmail(email: string) {
    return this.db.query.usuarios.findFirst({ where: eq(usuarios.email, email) });
  }

  findById(id: string) {
    return this.db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
  }
}
