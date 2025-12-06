import { v2 as cloudinary } from 'cloudinary';

export const uploadImage = async (req, res) => {
  try {
    if (!req.file && !(req.files && req.files.image)) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const imageFile = req.file || (req.files && req.files.image);
    
    const result = await cloudinary.uploader.upload(imageFile.tempFilePath || imageFile.path, {
      folder: `rms/restaurants/${req.user.branch._id}/uploads`
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
};
