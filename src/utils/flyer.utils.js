const xss = require('xss')

const sanitize = (flyer) => {
  return {
    id: flyer.id,
    creator_id: flyer.creator_id,
    flyer_type: flyer.flyer_type,
    image_url: xss(flyer.image_url),
    headline: xss(flyer.headline),
    bands: xss(flyer.bands),
    details: xss(flyer.details),
    publish_comment: xss(flyer.publish_comment),
    listing_state: flyer.listing_state,
    created: flyer.created,
    modified: flyer.modified
  }
}

module.exports = {
  sanitize
}
