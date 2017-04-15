const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding Blog data - is data generated');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  //console.info(seedData);
  return BlogPost.insertMany(seedData);
}

// generate an object represnting a restaurant.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
    title: faker.lorem.words(),
    author: {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
    },
    content: faker.lorem.paragraph(),
    created: Date.now()
  }
}

// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
}


describe('Blog-Posts API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedRestaurantData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  })

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing BlogPosts', function() {
      // strategy:
      //    1. get back all blog posts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of restaurants we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let resBlogPosts;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          // so subsequent .then blocks can access resp obj.
          //console.log(res.body);
          //console.log(BlogPost);
          resBlogPosts = res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          resBlogPosts.body.should.have.length.of(count);
        });
    });


    it('should return blog posts with right fields', function() {
      // Strategy: Get back all blog posts, and ensure they have expected keys

      let resBlogPosts;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(post) {
            post.should.be.a('object');
            post.should.include.keys(
              'id', 'title', 'author', 'content', 'created');
          });
          resBlogPosts = res.body[0];
          return BlogPost.findById(resBlogPosts.id);
        })
        .then(function(post) {

          resBlogPosts.id.should.equal(post.id);
          resBlogPosts.title.should.equal(post.title);
          resBlogPosts.author.should.equal(post.authorName);
          resBlogPosts.content.should.equal(post.content);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the Blog Post we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new Blog Post', function() {

      const newBlogPost = generateBlogPostData();

      return chai.request(app)
        .post('/posts')
        .send(newBlogPost)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'title', 'author', 'content', 'created');
          res.body.title.should.equal(newBlogPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          //console.log(res.body.author);
          //console.log(newBlogPost.author);
          res.body.author.should.equal(`${newBlogPost.author.firstName} ${newBlogPost.author.lastName}`);
          res.body.content.should.equal(newBlogPost.content);
          return BlogPost.findById(res.body.id);
        })
        .then(function(post) {
          post.title.should.equal(newBlogPost.title); 
          //console.log(post.authorName);
          //console.log(newBlogPost.author);         
          post.authorName.should.equal(`${newBlogPost.author.firstName} ${newBlogPost.author.lastName}`);  
          post.content.should.equal(newBlogPost.content);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing Blog Post from db
    //  2. Make a PUT request to update that Blog Post
    //  3. Prove Blog Post returned by request contains data we sent
    //  4. Prove Blog Post in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'New Title for put test',
        content: 'Probably a science fiction topic'
      };

      return BlogPost
        .findOne()
        .exec()
        .then(function(post) {
          updateData.id = post.id;
          console.log(updateData.id);
          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${post.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(201);
          return BlogPost.findById(updateData.id).exec();
        })
        .then(function(post) {
          post.title.should.equal(updateData.title);
          post.content.should.equal(updateData.content);
        });
      });
  });
  

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a Blog Post
    //  2. make a DELETE request for that Blog Post's id
    //  3. assert that response has right status code
    //  4. prove that Blog Post with the id doesn't exist in db anymore
    it('delete a Blog Post by id', function() {

      let post;

      return BlogPost
        .findOne()
        .exec()
        .then(function(_post) {
          post = _post;
          return chai.request(app).delete(`/posts/${post.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(post.id).exec();
        })
        .then(function(_post) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_post.should.be.null` would raise
          // an error. `should.be.null(_post)` is how we can
          // make assertions about a null value.
          should.not.exist(_post);
        });
    });
  });


});