import mysql from 'mysql';
import bcrypt from 'bcrypt';

const saltRounds = 10;

const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "employeems"
});

// Connect to the database
con.connect(function(err) {
  if (err) {
    console.log("Connection error: ", err);
  } else {
    console.log("Connected to the database");
    hashAndSavePasswords();
  }
});

// Function to hash and update passwords in the database
const hashAndSavePasswords = () => {
  const query = "SELECT ID, Password FROM admin";

  con.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching data: ", err);
      return;
    }

    results.forEach(user => {
      bcrypt.hash(user.Password, saltRounds, (err, hash) => {
        if (err) {
          console.error(`Error hashing password for user ID ${user.ID}:`, err);
        } else {
          const updateQuery = "UPDATE admin SET Password = ? WHERE ID = ?";
          con.query(updateQuery, [hash, user.ID], (err, result) => {
            if (err) {
              console.error(`Error updating password for user ID ${user.ID}:`, err);
            } else {
              console.log(`Password for user ID ${user.ID} updated successfully`);
            }
          });
        }
      });
    });
  });
};
