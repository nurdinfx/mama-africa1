// SQLite-only settings controller
import { db } from '../db/index.js';
import { v2 as cloudinary } from 'cloudinary';

export const getBranchSettings = async (req, res) => {
  try {
    const { branchId } = req.params;

    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && (req.user.branch._id || req.user.branch.id).toString() !== branchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get settings for this branch (stored in branches table as JSON or separate settings table)
    // The previous implementation used a 'Setting' model linked to branch. 
    // In sqlite.js, `branches` table has `settings` column (JSON string).
    // AND there is a `settings` table (key-value).
    // Let's use the schema from sqlite.js effectively.
    // If migration moved data to `branches.settings`, we use that. 
    // BUT the mongo model `Setting` suggests a separate document.
    // Let's use `branches.settings` JSON column for simplicity if populated, OR the `settings` table.
    // `sqlite.js` shows `settings` table with `key`, `value`, `branch`. This is key-value store.
    // original code returned an object.

    // Check if we use key-value or object storage.
    // For now, let's assume we store the whole settings object in `branches.settings` JSON column as per `sqlite.js` comments "settings TEXT, -- JSON string".
    // AND if `Setting` model had elaborate structure, JSON in branch is easiest.

    let settings = {};
    if (branch.settings) {
      try {
        settings = JSON.parse(branch.settings);
      } catch (e) {
        console.error("Failed to parse branch settings", e);
      }
    } else {
      // Fallback or legacy check on `settings` table if used as Key-Value
      // For now, defaulting to empty or extracting from KV if needed.
    }

    const response = {
      branch: { ...branch, _id: branch.id.toString() },
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

    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && (req.user.branch._id || req.user.branch.id).toString() !== branchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updates = [];
    const params = [];

    // Update branch information
    if (updateData.branch) {
      const bData = updateData.branch;
      if (bData.name) { updates.push('name = ?'); params.push(bData.name); }
      if (bData.address) { updates.push('address = ?'); params.push(bData.address); }
      if (bData.phone) { updates.push('phone = ?'); params.push(bData.phone); }
      if (bData.email) { updates.push('email = ?'); params.push(bData.email); }
    }

    // Update settings JSON
    if (updateData.settings) {
      // Merge with existing
      let currentSettings = {};
      if (branch.settings) {
        try { currentSettings = JSON.parse(branch.settings); } catch (e) { }
      }
      const newSettings = { ...currentSettings, ...updateData.settings };
      updates.push('settings = ?');
      params.push(JSON.stringify(newSettings));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(branchId);
      db.prepare(`UPDATE branches SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updatedBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    let finalSettings = {};
    if (updatedBranch.settings) {
      try { finalSettings = JSON.parse(updatedBranch.settings); } catch (e) { }
    }

    const response = {
      branch: { ...updatedBranch, _id: updatedBranch.id.toString() },
      settings: finalSettings
    };

    res.json({ success: true, data: response, message: 'Branch settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const getSettings = async (req, res) => {
  try {
    // This endpoint seems to return "System" settings or default branch settings?
    // The original code did:
    // if admin: Setting.findOne({}) -> returns first doc?
    // else: Setting.findOne({branch: user.branch})

    // We will standardize on Branch settings.
    const branchId = req.user.role === 'admin' ?
      (req.query.branchId || (req.user.branch._id || req.user.branch.id)) :
      (req.user.branch._id || req.user.branch.id);

    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId.toString());

    let settings;
    if (branch && branch.settings) {
      try { settings = JSON.parse(branch.settings); } catch (e) { }
    }

    if (!settings || Object.keys(settings).length === 0) {
      // Return default settings
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

    // If admin requested general settings and no branch specified or not found, return defaults.

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updateData = req.body;
    const branchId = req.user.role === 'admin' ?
      (req.body.branchId || (req.user.branch._id || req.user.branch.id)) :
      (req.user.branch._id || req.user.branch.id);

    // Update branch settings JSON
    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId.toString());

    let currentSettings = {};
    if (branch && branch.settings) {
      try { currentSettings = JSON.parse(branch.settings); } catch (e) { }
    }

    const newSettings = { ...currentSettings, ...updateData }; // Merge

    db.prepare('UPDATE branches SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(newSettings), branchId.toString());

    res.json({ success: true, data: newSettings, message: 'Settings updated successfully' });
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
    db.prepare('UPDATE branches SET logo = ? WHERE id = ?').run(result.secure_url, branchId);

    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);

    res.json({ success: true, data: { logo: result.secure_url, branch: { ...branch, _id: branch.id.toString() } }, message: 'Logo uploaded successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const getSystemSettings = async (req, res) => {
  try {
    // Static system settings
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
