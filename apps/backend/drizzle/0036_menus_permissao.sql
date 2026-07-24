CREATE TABLE "menus" (
	"codigo" varchar(60) PRIMARY KEY NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"href" varchar(120) NOT NULL,
	"grupo" varchar(20) NOT NULL,
	"ordem" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_menus" (
	"usuario_id" uuid NOT NULL,
	"menu_codigo" varchar(60) NOT NULL,
	CONSTRAINT "usuario_menus_usuario_id_menu_codigo_pk" PRIMARY KEY("usuario_id","menu_codigo")
);
--> statement-breakpoint
ALTER TABLE "usuario_menus" ADD CONSTRAINT "usuario_menus_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_menus" ADD CONSTRAINT "usuario_menus_menu_codigo_menus_codigo_fk" FOREIGN KEY ("menu_codigo") REFERENCES "public"."menus"("codigo") ON DELETE cascade ON UPDATE no action;