// backend/controllers/tableController.js
import Table from '../models/Table.js';

// Get all tables
export const getTables = async (req, res) => {
  try {
    const tables = await Table.find({ branch: req.user.branch._id }).sort({ number: 1 });
    
    res.json({
      success: true,
      data: tables,
      count: tables.length
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tables'
    });
  }
};

// Get available tables
export const getAvailableTables = async (req, res) => {
  try {
    const tables = await Table.find({ 
      branch: req.user.branch._id,
      status: 'available'
    }).sort({ number: 1 });

    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    console.error('Get available tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available tables'
    });
  }
};

// Get single table
export const getTable = async (req, res) => {
  try {
    const table = await Table.findOne({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      data: table
    });
  } catch (error) {
    console.error('Get table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table'
    });
  }
};

// Create table
export const createTable = async (req, res) => {
  try {
    const { tableNumber, name, capacity, location } = req.body;

    // Check if table number already exists in this branch
    const existingTable = await Table.findOne({
      number: tableNumber,
      branch: req.user.branch._id
    });

    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: 'Table number already exists'
      });
    }

    const tableData = {
      number: tableNumber,
      tableNumber: tableNumber,
      name: name || `Table ${tableNumber}`,
      capacity: parseInt(capacity),
      location: location || 'indoor',
      status: 'available',
      branch: req.user.branch._id
    };

    const table = new Table(tableData);
    await table.save();

    res.status(201).json({
      success: true,
      data: table,
      message: 'Table created successfully'
    });
  } catch (error) {
    console.error('Create table error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create table'
    });
  }
};

// Update table
export const updateTable = async (req, res) => {
  try {
    const { tableNumber, name, capacity, location } = req.body;

    // Check if table number already exists (excluding current table)
    if (tableNumber) {
      const existingTable = await Table.findOne({
        number: tableNumber,
        branch: req.user.branch._id,
        _id: { $ne: req.params.id }
      });

      if (existingTable) {
        return res.status(400).json({
          success: false,
          message: 'Table number already exists'
        });
      }
    }

    const updateData = {
      ...(tableNumber && { 
        number: tableNumber,
        tableNumber: tableNumber 
      }),
      ...(name && { name }),
      ...(capacity && { capacity: parseInt(capacity) }),
      ...(location && { location })
    };

    const table = await Table.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      data: table,
      message: 'Table updated successfully'
    });
  } catch (error) {
    console.error('Update table error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update table'
    });
  }
};

// Update table status
export const updateTableStatus = async (req, res) => {
  try {
    const { status, customers } = req.body;

    const updateData = {
      status,
      updatedAt: new Date()
    };

    if (status === 'occupied') {
      updateData.currentSession = {
        startedAt: new Date(),
        customers: customers || 1,
        waiter: {
          _id: req.user._id,
          name: req.user.name
        }
      };
    } else {
      updateData.currentSession = null;
    }

    const table = await Table.findOneAndUpdate(
      { _id: req.params.id, branch: req.user.branch._id },
      updateData,
      { new: true }
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      data: table,
      message: 'Table status updated successfully'
    });
  } catch (error) {
    console.error('Update table status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table status'
    });
  }
};

// Delete table
export const deleteTable = async (req, res) => {
  try {
    const table = await Table.findOneAndDelete({
      _id: req.params.id,
      branch: req.user.branch._id
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      message: 'Table deleted successfully'
    });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete table'
    });
  }
};