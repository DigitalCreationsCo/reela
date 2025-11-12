CREATE TABLE "Chat" (
	"id" uuid PRIMARY KEY NOT NULL,
	"createdAt" timestamp NOT NULL,
	"messages" json,
	"userId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"username" varchar(32) NOT NULL,
	"password" varchar(64),
	CONSTRAINT "User_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;