import { auth } from "auth";

export default auth((req) => {
  
});

export const config = {
  matcher: ["/", "/:id", "/api/:path*", "/login", "/register"],
};
