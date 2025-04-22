import mysql from 'mysql';
import bcrypt from 'bcrypt';

const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // Your MySQL password if you have one
  database: "employeems" // Your database name
});

con.connect(function (err) {
  if (err) {
    console.log("Connection error: ", err);
  } else {
    console.log("Connected to the database");
    resetPasswords();
  }
});

const resetPasswords = () => {
  const passwords = {
    "admin1@example.com": "password123",
    "admin2@example.com": "securepass456",
    "employee@example.com": "rividi321",
    "hr@example.com": "swiftbetty1213",
    "employeern@example.com": "taylor1989",
    "manager@example.com": "plain_text_password"
  };

  Object.keys(passwords).forEach(email => {
    bcrypt.hash(passwords[email], 10, (err, hash) => {
      if (err) {
        console.error(`Error hashing password for ${email}:`, err);
      } else {
        const updateQuery = "UPDATE admin SET Password = ? WHERE Email = ?";
        con.query(updateQuery, [hash, email], (err, result) => {
          if (err) {
            console.error(`Error updating password for ${email}:`, err);
          } else {
            console.log(`Password for ${email} updated successfully`);
          }
        });
      }
    });
  });
};
