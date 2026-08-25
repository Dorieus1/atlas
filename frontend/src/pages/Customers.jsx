import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { getCustomers, getTags } from "../api/atlasApi";
import CustomerForm from "../components/CustomerForm";
import EmptyState from "../components/EmptyState";
import { downloadCSV } from "../utils/csv";


function Customers() {


  const [customers, setCustomers] = useState([]);

  const [search, setSearch] = useState("");

  const [loadError, setLoadError] = useState("");

  const [tags, setTags] = useState([]);

  const [tagFilter, setTagFilter] = useState("");

  const navigate = useNavigate();



  const loadCustomers = async () => {


    try {


      const data = await getCustomers();


      setCustomers(data);

      setLoadError("");


    } catch(error) {


      console.error(
        "CUSTOMER ERROR:",
        error
      );


      setLoadError("Couldn't load your customers. Please refresh to try again.");


    }


  };



  const loadTags = async () => {

    try {

      const data = await getTags();
      setTags(data);

    } catch (error) {

      console.error("TAGS LOAD ERROR:", error);

    }

  };




  useEffect(() => {


    loadCustomers();
    loadTags();


  }, []);



  const query = search.trim().toLowerCase();

  const searchedCustomers = query
    ? customers.filter((customer) =>
        (customer.name || "").toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query)
      )
    : customers;

  // Client-side, same as the search above - the full list is already
  // loaded, so there's no need for a round trip just to filter by tag.
  // The backend also supports a tag_id query param on GET /api/customers
  // independently (e.g. for a future paginated view).
  const filteredCustomers = tagFilter
    ? searchedCustomers.filter((customer) =>
        (customer.tags || []).some((tag) => tag.id === tagFilter)
      )
    : searchedCustomers;


  const exportCSV = () => {

    downloadCSV(

      "customers.csv",

      [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "created_at", label: "Created At" }
      ],

      filteredCustomers

    );

  };


  return (

    <div className="p-8">


      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h1 className="
            text-3xl
            font-bold
          ">

            👥 Customers

          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Every customer in one place.
          </p>

        </div>

        {customers.length > 0 && (

          <button

            onClick={exportCSV}

            className="bg-ink-800 hover:bg-ink-700 border border-ink-700 px-4 py-2 rounded-lg text-sm"

          >

            ⬇️ Export CSV

          </button>

        )}

      </div>



      <CustomerForm

        onCustomerCreated={loadCustomers}

      />


      {customers.length > 0 && (

        <div className="mt-8 flex flex-wrap gap-3">

          <input

            value={search}

            onChange={(e) => setSearch(e.target.value)}

            placeholder="Search by name or email"

            className="
              flex-1
              min-w-[220px]
              bg-ink-900/60
              text-white
              placeholder:text-slate-500
              border
              border-ink-700
              rounded-lg
              p-3
            "

          />

          {tags.length > 0 && (

            <select

              value={tagFilter}

              onChange={(e) => setTagFilter(e.target.value)}

              className="
                bg-ink-900/60
                text-white
                border
                border-ink-700
                rounded-lg
                p-3
              "

            >

              <option value="">All tags</option>

              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}

            </select>

          )}

        </div>

      )}




      <div className="
        mt-8
        grid
        gap-4
      ">


      {loadError ? (

        <p className="text-red-400">

          {loadError}

        </p>


      ) : customers.length === 0 ? (

        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Add your first customer above to start tracking conversations and leads."
        />


      ) : filteredCustomers.length === 0 ? (

        <p className="text-slate-400">

          No customers match "{search.trim()}".

        </p>


      ) : (


        filteredCustomers.map((customer)=>(


          <button

            key={customer.id}

            onClick={()=>navigate(`/customers/${customer.id}`)}

            className="
              text-left
              border
              border-ink-700
              bg-ink-900/60
              hover:border-ink-600
              hover:bg-ink-900
              rounded-xl
              p-5
              transition
            "

          >

            <h2 className="
              text-xl
              font-bold
            ">

              {customer.name}

            </h2>



            <p className="text-slate-300">

              {customer.email}

            </p>

            {customer.phone && (

              <p className="text-slate-400">

                {customer.phone}

              </p>

            )}

            {(customer.tags || []).length > 0 && (

              <div className="mt-3 flex flex-wrap gap-1.5">

                {customer.tags.map((tag) => (

                  <span
                    key={tag.id}
                    className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs text-slate-300"
                  >
                    {tag.name}
                  </span>

                ))}

              </div>

            )}


          </button>


        ))


      )}


      </div>


    </div>

  );

}


export default Customers;
