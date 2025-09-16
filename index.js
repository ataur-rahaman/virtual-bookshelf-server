const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d4gmgst.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyTokenEmail = (req, res, next) => {
  if (req.query.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

async function run() {
  try {
    // await client.connect();

    const usersCollection = client.db("virtualBookshelf").collection("users");
    const booksCollection = client.db("virtualBookshelf").collection("books");
    const reviewsCollection = client
      .db("virtualBookshelf")
      .collection("reviews");

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const result = await usersCollection.updateOne(
        { email: newUser.email },
        { $setOnInsert: newUser },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        res.send({ success: true, message: "User inserted!" });
      } else {
        res.send({ success: false, message: "User already exists!" });
      }
    });

    app.put("/books/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const book = await booksCollection.findOne(query);
        if (!book) return res.status(404).send({ message: "Not found" });

        if (!book.user_email || book.user_email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const updatedBook = req.body;
        const update = { $set: updatedBook };
        const result = await booksCollection.updateOne(query, update);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedStatus = req.body;
      const update = { $set: updatedStatus };
      const result = await booksCollection.updateOne(filter, update);
      res.send(result);
    });

    app.post("/books", async (req, res) => {
      const newBook = req.body;
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });

    app.delete("/books/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const book = await booksCollection.findOne(query);
        if (!book) return res.status(404).send({ message: "Not found" });

        if (!book.user_email || book.user_email !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await booksCollection.deleteOne(query);
        if (result.deletedCount === 1) {
          return res.send({ success: true, message: "Deleted" });
        }
        return res.status(500).send({ message: "Could not delete" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get(
      "/my-books",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;
        const query = { user_email: email };
        const result = await booksCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const book_id = req.query.book_id;
      const result = await reviewsCollection
        .find({ book_id: book_id })
        .toArray();
      res.send(result);
    });

    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedReview = req.body;
      const updatedData = {
        $set: updatedReview,
      };
      const result = await reviewsCollection.updateOne(query, updatedData);
      res.send(result);
    });

    app.get("/reviews/check", async (req, res) => {
      const { book_id, user_email } = req.query;
      const query = {
        book_id,
        user_email,
      };
      const result = await reviewsCollection.findOne(query);
      if (result) {
        res.send({ exist: true });
      } else {
        res.send({ exist: false });
      }
    });

    app.put("/books/:id/upvote", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const newUpvote = {
        $inc: { upvote: 1 },
      };
      const result = await booksCollection.updateOne(filter, newUpvote);
      res.send(result);
    });

    app.get("/books", async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.get("/top-books", async (req, res) => {
      const result = await booksCollection
        .find()
        .sort({ upvote: -1 })
        .limit(8)
        .toArray();
      res.send(result);
    });

    app.get("/search", async (req, res) => {
      const search = req.query.q;
      const query = {
        $or: [
          { book_title: { $regex: search, $options: "i" } },
          { book_author: { $regex: search, $options: "i" } },
          { reading_status: { $regex: search, $options: "i" } },
        ],
      };

      const result = await booksCollection.find(query).toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("virtual server is running");
});

app.listen(port, () => {
  console.log(`virtual server is running on port:${port}`);
});

