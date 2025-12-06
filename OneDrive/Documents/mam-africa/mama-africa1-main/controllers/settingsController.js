import Branch from '../models/Branch.js';
import Setting from '../models/Setting.js';
import { v2 as cloudinary } from 'cloudinary';

export const getBranchSettings = async (req, res) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Check if user has access to this branch
    if (req.user.role !== 'admin' && req.user.branch._id.toString() !== branchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get settings for this branch
    const settings = await Setting.findOne({ branch: branchId });
    
    const response = {
      branch: branch,
      settings: settings || {}
    };

    res.json({ success: true, data: response });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const updateBranchSettings = async (req, res) => {
  try {
    const { branchId } = req.params;
    const updateData = req.body;

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.branch._id.toString() !== branchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Update branch information
    if (updateData.branch) {
      const updatedBranch = await Branch.findByIdAndUpdate(
        branchId,
        updateData.branch,
        { new: true, runValidators: true }
      );
    }

    // Update or create settings
    let settings = await Setting.findOne({ branch: branchId });
    
    if (settings && updateData.settings) {
      settings = await Setting.findByIdAndUpdate(
        settings._id,
        updateData.settings,
        { new: true, runValidators: true }
      );
    } else if (updateData.settings) {
      settings = await Setting.create({
        ...updateData.settings,
        branch: branchId
      });
    }

    const response = {
      branch: await Branch.findById(branchId),
      settings: settings || {}
    };

    res.json({ success: true, data: response, message: 'Branch settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const getSettings = async (req, res) => {
  try {
    let settings;
    
    if (req.user.role === 'admin') {
      // Admin can access all settings or default settings
      settings = await Setting.findOne({}).populate('branch');
    } else {
      // Regular users get their branch settings
      const branchId = req.user.branch._id.toString();
      settings = await Setting.findOne({ branch: branchId }).populate('branch');
    }

    if (!settings) {
      // Return default settings if none found
      settings = {
        restaurantName: 'Mama Africa Restaurant',
        currency: 'USD',
        taxRate: 10,
        serviceCharge: 5,
        receiptHeader: 'Mama Africa Restaurant',
        receiptFooter: 'Thank you for dining with us!',
        businessHours: {
          monday: { open: '09:00', close: '22:00', closed: false },
          tuesday: { open: '09:00', close: '22:00', closed: false },
          wednesday: { open: '09:00', close: '22:00', closed: false },
          thursday: { open: '09:00', close: '22:00', closed: false },
          friday: { open: '09:00', close: '23:00', closed: false },
          saturday: { open: '10:00', close: '23:00', closed: false },
          sunday: { open: '10:00', close: '21:00', closed: false }
        }
      };
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updateData = req.body;
    let settings;

    if (req.user.role === 'admin') {
      // Admin can update any settings
      settings = await Setting.findOneAndUpdate(
        {},
        updateData,
        { new: true, upsert: true, runValidators: true }
      );
    } else {
      // Regular users update their branch settings
      const branchId = req.user.branch._id.toString();
      settings = await Setting.findOneAndUpdate(
        { branch: branchId },
        updateData,
        { new: true, upsert: true, runValidators: true }
      );
    }

    res.json({ success: true, data: settings, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const uploadLogo = async (req, res) => {
  try {
    const { branchId } = req.params;
    // Expect multipart/form-data with field name 'logo'
    if (!req.file && !(req.files && req.files.logo)) {
      return res.status(400).json({ success: false, message: 'No logo file uploaded' });
    }

    const fileToUpload = req.file || (req.files && req.files.logo);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(fileToUpload.tempFilePath || fileToUpload.path, {
      folder: `rms/restaurants/${branchId}`,
      width: 300,
      height: 300,
      crop: 'limit'
    });

    // Update branch with logo URL
    const branch = await Branch.findByIdAndUpdate(
      branchId,
      { logo: result.secure_url },
      { new: true }
    );

    res.json({ success: true, data: { logo: result.secure_url, branch }, message: 'Logo uploaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const getSystemSettings = async (req, res) => {
  try {
    const systemSettings = {
      appName: 'Mama Africa Restaurant',
      version: '1.0.0',
      maxBranches: 5,
      features: {
        inventory: true,
        multiBranch: true,
        onlineOrders: false
      }
    };

    res.json({ success: true, data: systemSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
