import { PetTravelApp } from "@/features/pettravel/PetTravelApp";
import { adminPolicy, demoOrder, demoUsers, products, rolePermissions, suppliers } from "@/lib/mock-data";

export default function Home() {
  return (
    <PetTravelApp
      users={demoUsers}
      products={products}
      suppliers={suppliers}
      order={demoOrder}
      rolePermissions={rolePermissions}
      adminPolicy={adminPolicy}
    />
  );
}
