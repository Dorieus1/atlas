function BusinessProfile({ business }) {

  if (!business) {

    return null;

  }


  return (

    <div className="card">

      <h2>
        Business Profile
      </h2>


      <p>
        <strong>Name:</strong> {business.name}
      </p>


      <p>
        <strong>Industry:</strong> {business.industry || "Not set"}
      </p>


      <p>
        <strong>Services:</strong> {business.services || "Not set"}
      </p>


      <p>
        <strong>Phone:</strong> {business.phone || "Not set"}
      </p>


      <p>
        <strong>Email:</strong> {business.email || "Not set"}
      </p>


      <p>
        <strong>Address:</strong> {business.address || "Not set"}
      </p>


    </div>

  );

}


export default BusinessProfile;