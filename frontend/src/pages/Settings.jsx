import { useEffect, useState } from "react";
import { getBusinesses } from "../api/atlasApi";
import BusinessProfile from "../components/BusinessProfile";

function Settings() {

  const [business, setBusiness] = useState(null);

  useEffect(() => {

    async function loadBusiness() {

      try {

        const businesses = await getBusinesses();

        setBusiness(businesses[0] || null);

      } catch (error) {

        console.error("Failed to load business:", error);

      }

    }

    loadBusiness();

  }, []);

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold">
        ⚙️ Settings
      </h1>

      <BusinessProfile business={business} />

    </div>

  );

}

export default Settings;
