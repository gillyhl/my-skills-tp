const express = require("express")
const config = require("config")
const R = require("ramda")
const bodyParser = require("body-parser")
const app = express()
app.use(bodyParser.urlencoded({
  extended: true
}))
app.use(require("express-session")({
  secret: config.get("session.secret"),
  saveUninitialized: true,
  resave: true
}))
const querystring = require("querystring")
const axios = require("axios").default
const resourceServer = config.get("resourceServer")
const serverRoot = config.get("serverRoot")
app.set("view engine", "pug");

const port = config.get("port")
const oauthClient = config.get("oauthClient")

const isAuthenticated = (req, res, next) => {
  if(!req.session.access_token) return res.redirect("/")
  return next()
}

app.get("/login", (req, res) => {
  const qs = querystring.stringify({
    client_id: oauthClient.id,
    response_type: "code",
    scope: "openid profile read_skills write_skills",
    redirect_uri: `${serverRoot}/authorization-code/callback`,
    state: Math.random().toString(36).substring(7)
  })
  res.redirect(`${oauthClient.issuerUrl}/v1/authorize?${qs}`)
})

app.get("/authorization-code/callback", async (req, res) => {
  const {code, state} = req.query
  try {
    const response = await axios.post(`${oauthClient.issuerUrl}/v1/token`, querystring.stringify({
      grant_type: "authorization_code",
      redirect_uri: `${serverRoot}/authorization-code/callback`,
      code
    }), {
      auth: {
        username: oauthClient.id,
        password: oauthClient.secret,
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      }
    })
    req.session.access_token = response.data.access_token
    req.session.id_token = response.data.id_token
    const hour = 3600000
    req.session.cookie.expires = new Date(Date.now() + hour)
    req.session.cookie.maxAge = hour
    res.redirect("/skills")
  } catch (e) {
    res.render("error")
  }  
})

app.get("/", async (req, res) => {
  const authenticated = R.not(R.isNil(req.session.access_token))
  res.render("index", {authenticated})
})



app.get("/skills", isAuthenticated, async (req, res) => {
  try {
    const result = await axios.get(`${resourceServer}/`, {
      headers: { Authorization: `Bearer ${req.session.access_token}` }
    })
    res.render("skills", {skills: result.data.skills, authenticated: true})
  } catch (e) {
    console.log(e)
    res.render("error")
  }
})

app.get("/add-skills", isAuthenticated, async (req, res) => {
  res.render("add-skills", {authenticated: true})
})

app.post("/add-skills", isAuthenticated, async (req, res) => {
  const {skills} = req.body
  try {
    const result = await axios.post(`${resourceServer}/`, {skills: R.split(",", skills)},  {
      headers: { Authorization: `Bearer ${req.session.access_token}` }
    })
    res.render("add-skills", {success: true, authenticated: true})
  } catch (e) {
    console.log(e)
    res.render("error")
  }
})

app.get("/logout", (req, res) => {
  req.session.destroy()
  res.redirect("/")
})

app.listen(port, () => {
  console.log(`Listening on port: ${port}`)
})