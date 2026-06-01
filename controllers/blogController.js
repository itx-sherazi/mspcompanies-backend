const Blog = require("../models/Blog");
const cloudinary = require("../config/cloudinary");

// Upload buffer to Cloudinary and return secure URL
async function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "msp-blog", resource_type: "image" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// POST /api/v1/creat
exports.createBlog = async (req, res) => {
  try {
    const { title, slug, body, category, tags, author, metaTitle, metaDescription, faqs } = req.body;

    if (!title || !slug) {
      return res.status(400).json({ message: "Title and slug are required" });
    }

    let imageUrl = "";
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    }

    let parsedFaqs = [];
    if (faqs) {
      try { parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs; } catch {}
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === "string"
          ? tags.split(",").map((t) => t.trim()).filter(Boolean)
          : tags;
      } catch {}
    }

    const blog = await Blog.create({
      title,
      slug,
      body: body || "",
      image: imageUrl,
      category: category || "General",
      tags: parsedTags,
      author: author || "MSP Companies Team",
      metaTitle: metaTitle || "",
      metaDescription: metaDescription || "",
      faqs: parsedFaqs,
    });

    res.status(201).json({ message: "Blog created successfully", data: blog });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A blog with this slug already exists" });
    }
    console.error("createBlog error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/v1/update/:id
exports.updateBlog = async (req, res) => {
  try {
    const { title, slug, body, category, tags, author, metaTitle, metaDescription, faqs } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    let imageUrl = blog.image;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    }

    let parsedFaqs = blog.faqs;
    if (faqs !== undefined) {
      try { parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs; } catch {}
    }

    let parsedTags = blog.tags;
    if (tags !== undefined) {
      try {
        parsedTags = typeof tags === "string"
          ? tags.split(",").map((t) => t.trim()).filter(Boolean)
          : tags;
      } catch {}
    }

    blog.title = title || blog.title;
    blog.slug = slug || blog.slug;
    blog.body = body !== undefined ? body : blog.body;
    blog.image = imageUrl;
    blog.category = category || blog.category;
    blog.tags = parsedTags;
    blog.author = author || blog.author;
    blog.metaTitle = metaTitle !== undefined ? metaTitle : blog.metaTitle;
    blog.metaDescription = metaDescription !== undefined ? metaDescription : blog.metaDescription;
    blog.faqs = parsedFaqs;

    await blog.save();
    res.json({ message: "Blog updated successfully", data: blog });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A blog with this slug already exists" });
    }
    console.error("updateBlog error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/v1/blogdelete/:id
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("deleteBlog error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/v1/get?page=1&limit=10
exports.getBlogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const total = await Blog.countDocuments({ published: true });
    const blogs = await Blog.find({ published: true })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select("-body");

    res.json({
      data: blogs,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total,
    });
  } catch (error) {
    console.error("getBlogs error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/v1/getById/:slug
exports.getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug, published: true });
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json({ data: blog });
  } catch (error) {
    console.error("getBlogBySlug error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/v1/latest-posts
exports.getLatestPosts = async (req, res) => {
  try {
    const blogs = await Blog.find({ published: true })
      .sort({ date: -1 })
      .limit(5)
      .select("title slug image date category");
    res.json({ data: blogs });
  } catch (error) {
    console.error("getLatestPosts error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/v1/get-sitemapblog
exports.getBlogsSitemap = async (req, res) => {
  try {
    const blogs = await Blog.find({ published: true })
      .sort({ date: -1 })
      .select("slug updatedAt date");
    res.json({ data: blogs });
  } catch (error) {
    console.error("getBlogsSitemap error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
