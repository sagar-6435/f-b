import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import {
  fetchUsersByRole, createUser, updateUser, deleteUser,
  fetchAllOrders, fetchStock, createProductWithStock,
  sendNotificationToUser, broadcastNotification,
} from '../backend/freshBasketBackend';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  Placed:         '#1565C0',
  Confirmed:      '#6A1B9A',
  Preparing:      '#E65100',
  Ready:          '#2E7D32',
  Assigned:       '#00838F',
  OutForDelivery: '#F57F17',
  Delivered:      '#388E3C',
  Cancelled:      '#C62828',
};

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Send notification modal (admin → customer)
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_MESSAGES = [
  { label: '🚴 Out for Delivery', title: '🚴 Out for Delivery!',  body: 'Your order is on the way. Stay ready!' },
  { label: '✅ Delivered',        title: '✅ Order Delivered!',   body: 'Your order has been delivered. Enjoy!' },
  { label: '👍 Confirmed',        title: '👍 Order Confirmed',    body: 'Your order has been confirmed and is being prepared.' },
  { label: '⏳ Delay',            title: '⏳ Slight Delay',       body: 'Your order is running a little late. We apologise for the inconvenience.' },
];

function SendNotificationModal({ visible, order, onClose }) {
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);

  const fill = (preset) => { setTitle(preset.title); setBody(preset.body); };
  const reset = () => { setTitle(''); setBody(''); };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Required', 'Title and message cannot be empty.');
      return;
    }
    setSending(true);
    try {
      await sendNotificationToUser(order.customerId, title.trim(), body.trim());
      Alert.alert('Sent ✓', `Notification sent to ${order.customerName || 'customer'}.`);
      reset();
      onClose();
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <View>
              <Text style={styles.modalTitle}>Send Notification</Text>
              <Text style={styles.modalSubtitle}>
                To: {order?.customerName || '—'} · #{String(order?._id ?? '').slice(-6).toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Quick presets */}
          <Text style={styles.inputLabel}>Quick messages</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {QUICK_MESSAGES.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={styles.presetChip}
                onPress={() => fill(q)}
              >
                <Text style={styles.presetChipText}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.inputLabel}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Notification title"
          />

          <Text style={styles.inputLabel}>Message</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            value={body}
            onChangeText={setBody}
            placeholder="Notification body"
            multiline
          />

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, sending && { opacity: 0.6 }]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Send</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-user modal (shared by delivery & supplier tabs)
// ─────────────────────────────────────────────────────────────────────────────

function AddUserModal({ visible, role, onClose, onSaved }) {
  const [phone, setPhone]   = useState('');
  const [name,  setName]    = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setPhone(''); setName(''); };

  const handleSave = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid phone', 'Enter a valid phone number (min 10 digits).');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    setSaving(true);
    try {
      await createUser({
        phoneNumber: `+${digits}`,
        displayName: name.trim(),
        role,
      });
      reset();
      onSaved();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            Add {role === 'delivery' ? 'Delivery Boy' : 'Supplier'}
          </Text>

          <Text style={styles.inputLabel}>Phone number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 919876543210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={15}
          />

          <Text style={styles.inputLabel}>Display name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add stock item modal (admin creates a new product + stock entry)
// ─────────────────────────────────────────────────────────────────────────────

const UNITS = ['packs', 'kg', 'litres', 'pieces', 'boxes', 'grams'];

function AddStockModal({ visible, onClose, onSaved }) {
  const [title,        setTitle]        = useState('');
  const [price,        setPrice]        = useState('');
  const [description,  setDescription]  = useState('');
  const [tag,          setTag]          = useState('');
  const [unit,         setUnit]         = useState('packs');
  const [quantity,     setQuantity]     = useState('0');
  const [minThreshold, setMinThreshold] = useState('10');
  const [saving,       setSaving]       = useState(false);

  const reset = () => {
    setTitle(''); setPrice(''); setDescription(''); setTag('');
    setUnit('packs'); setQuantity('0'); setMinThreshold('10');
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Product name is required.'); return; }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      Alert.alert('Required', 'Enter a valid price.'); return;
    }
    setSaving(true);
    try {
      await createProductWithStock({
        title:        title.trim(),
        price:        Number(price),
        description:  description.trim(),
        tag:          tag.trim() || null,
        unit,
        quantity:     Number(quantity) || 0,
        minThreshold: Number(minThreshold) || 10,
      });
      reset();
      onSaved();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.modalCard}
        >
          <Text style={styles.modalTitle}>New Stock Item</Text>
          <Text style={styles.modalHint}>Creates a new product and adds it to stock.</Text>

          <Text style={styles.inputLabel}>Product name *</Text>
          <TextInput style={styles.input} placeholder="e.g. Ragi Flour" value={title} onChangeText={setTitle} />

          <Text style={styles.inputLabel}>Price (₹) *</Text>
          <TextInput style={styles.input} placeholder="e.g. 120" keyboardType="numeric" value={price} onChangeText={setPrice} />

          <Text style={styles.inputLabel}>Description</Text>
          <TextInput
            style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder="Short description (optional)"
            multiline
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.inputLabel}>Tag (optional)</Text>
          <TextInput style={styles.input} placeholder="e.g. New Arrival" value={tag} onChangeText={setTag} />

          <Text style={styles.inputLabel}>Unit</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {UNITS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, unit === u && styles.unitChipActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.inputLabel}>Initial quantity</Text>
          <TextInput style={styles.input} placeholder="0" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />

          <Text style={styles.inputLabel}>Low-stock alert below</Text>
          <TextInput style={styles.input} placeholder="10" keyboardType="numeric" value={minThreshold} onChangeText={setMinThreshold} />

          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Add Item</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DeliveryOrdersModal({ visible, partner, onClose }) {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!visible || !partner) return;
    setLoading(true);
    const id = partner._id ?? partner.id;
    fetchAllOrders({ deliveryPartnerId: id })
      .then(setOrders)
      .catch((err) => Alert.alert('Error', err.message))
      .finally(() => setLoading(false));
  }, [visible, partner]);

  const delivered = orders.filter((o) => o.status === 'Delivered').length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '85%' }]}>
          <View style={styles.modalHeaderRow}>
            <View>
              <Text style={styles.modalTitle}>{partner?.displayName ?? '—'}</Text>
              <Text style={styles.modalSubtitle}>{partner?.phoneNumber} · {delivered} delivered</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : orders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={36} color="#CCC" />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {orders.map((o) => (
                <View key={o._id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderRowId}>#{String(o._id).slice(-6).toUpperCase()}</Text>
                    <Text style={styles.orderRowMeta}>
                      {o.customerName || '—'} · ₹{o.totalAmount}
                    </Text>
                    <Text style={styles.orderRowDate}>{fmt(o.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[o.status] ?? '#888' }]}>
                    <Text style={styles.statusBadgeText}>{o.status}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// User list row (delivery / supplier)
// ─────────────────────────────────────────────────────────────────────────────

function UserRow({ user, role, onDelete, onViewOrders }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      'Remove user',
      `Remove ${user.displayName} (${user.phoneNumber})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteUser(user._id ?? user.id);
              onDelete();
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.userRow}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {(user.displayName ?? '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{user.displayName}</Text>
        <Text style={styles.userPhone}>{user.phoneNumber}</Text>
        {role === 'delivery' && (
          <View style={[styles.onlinePill, user.isOnline && styles.onlinePillActive]}>
            <Text style={[styles.onlinePillText, user.isOnline && styles.onlinePillTextActive]}>
              {user.isOnline ? '● Online' : '○ Offline'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.userActions}>
        {role === 'delivery' && (
          <TouchableOpacity style={styles.iconBtn} onPress={() => onViewOrders(user)}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={handleDelete} disabled={deleting}>
          {deleting
            ? <ActivityIndicator size="small" color="#C62828" />
            : <Ionicons name="trash-outline" size={18} color="#C62828" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Delivery', 'Suppliers', 'Stock', 'Notify'];

export default function AdminDashboardScreen({ navigation }) {
  const [activeTab,    setActiveTab]    = useState('Overview');
  const [refreshing,   setRefreshing]   = useState(false);

  // Overview
  const [allOrders,    setAllOrders]    = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Delivery boys
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [dbLoading,    setDbLoading]    = useState(false);
  const [showAddDB,    setShowAddDB]    = useState(false);
  const [viewPartner,  setViewPartner]  = useState(null);

  // Suppliers
  const [suppliers,    setSuppliers]    = useState([]);
  const [supLoading,   setSupLoading]   = useState(false);
  const [showAddSup,   setShowAddSup]   = useState(false);

  // Stock
  const [stock,        setStock]        = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);

  // Notifications
  const [notifyOrder,  setNotifyOrder]  = useState(null);

  // Broadcast
  const [bcTitle,      setBcTitle]      = useState('');
  const [bcBody,       setBcBody]       = useState('');
  const [bcRole,       setBcRole]       = useState('customer');
  const [bcSending,    setBcSending]    = useState(false);
  const [bcHistory,    setBcHistory]    = useState([]);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    setStatsLoading(true);
    try {
      const orders = await fetchAllOrders();
      setAllOrders(orders);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadDelivery = useCallback(async () => {
    setDbLoading(true);
    try {
      const list = await fetchUsersByRole('delivery');
      setDeliveryBoys(list);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setDbLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    setSupLoading(true);
    try {
      const list = await fetchUsersByRole('supplier');
      setSuppliers(list);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSupLoading(false);
    }
  }, []);

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const s = await fetchStock();
      setStock(s);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setStockLoading(false);
    }
  }, []);

  const loadTab = useCallback((tab) => {
    if (tab === 'Overview') loadOverview();
    if (tab === 'Delivery') loadDelivery();
    if (tab === 'Suppliers') loadSuppliers();
    if (tab === 'Stock')    loadStock();
  }, [loadOverview, loadDelivery, loadSuppliers, loadStock]);

  useEffect(() => { loadTab(activeTab); }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([
      loadOverview(), loadDelivery(), loadSuppliers(), loadStock(),
    ]).finally(() => setRefreshing(false));
  };

  // ── Overview stats ────────────────────────────────────────────────────────

  const totalRevenue  = allOrders.filter((o) => o.status === 'Delivered').reduce((s, o) => s + o.totalAmount, 0);
  const pendingOrders = allOrders.filter((o) => !['Delivered', 'Cancelled'].includes(o.status)).length;
  const delivered     = allOrders.filter((o) => o.status === 'Delivered').length;

  const overviewStats = [
    { label: 'Total Orders', value: String(allOrders.length), icon: 'receipt-outline' },
    { label: 'Delivered',    value: String(delivered),        icon: 'checkmark-circle-outline' },
    { label: 'Pending',      value: String(pendingOrders),    icon: 'time-outline' },
    { label: 'Revenue',      value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: 'cash-outline' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer backgroundColor="#F8F5F1">

      {/* Delivery boy orders modal */}
      <DeliveryOrdersModal
        visible={!!viewPartner}
        partner={viewPartner}
        onClose={() => setViewPartner(null)}
      />

      {/* Add delivery boy modal */}
      <AddUserModal
        visible={showAddDB}
        role="delivery"
        onClose={() => setShowAddDB(false)}
        onSaved={() => { setShowAddDB(false); loadDelivery(); }}
      />

      {/* Add supplier modal */}
      <AddUserModal
        visible={showAddSup}
        role="supplier"
        onClose={() => setShowAddSup(false)}
        onSaved={() => { setShowAddSup(false); loadSuppliers(); }}
      />

      {/* Add stock item modal */}
      <AddStockModal
        visible={showAddStock}
        onClose={() => setShowAddStock(false)}
        onSaved={() => { setShowAddStock(false); loadStock(); }}
      />

      {/* Send notification modal */}
      <SendNotificationModal
        visible={!!notifyOrder}
        order={notifyOrder ?? {}}
        onClose={() => setNotifyOrder(null)}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Admin</Text>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.navigate('DashboardHub')}>
          <Ionicons name="grid-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={styles.switchBtnText}>Switch</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={{ paddingHorizontal: 2 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Tab content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* ════ OVERVIEW ════ */}
        {activeTab === 'Overview' && (
          statsLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
            <>
              <View style={styles.statsGrid}>
                {overviewStats.map((s) => (
                  <View key={s.label} style={styles.statCard}>
                    <Ionicons name={s.icon} size={22} color={colors.primary} />
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Recent orders</Text>
              {allOrders.slice(0, 20).map((o) => (
                <View key={o._id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderRowId}>#{String(o._id).slice(-6).toUpperCase()}</Text>
                    <Text style={styles.orderRowMeta}>{o.customerName || '—'} · ₹{o.totalAmount}</Text>
                    <Text style={styles.orderRowDate}>{fmt(o.createdAt)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.notifyBtn}
                    onPress={() => setNotifyOrder(o)}
                  >
                    <Ionicons name="notifications-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[o.status] ?? '#888' }]}>
                    <Text style={styles.statusBadgeText}>{o.status}</Text>
                  </View>
                </View>
              ))}
              {allOrders.length === 0 && (
                <View style={styles.emptyBox}>
                  <Ionicons name="receipt-outline" size={36} color="#CCC" />
                  <Text style={styles.emptyText}>No orders yet</Text>
                </View>
              )}
            </>
          )
        )}

        {/* ════ DELIVERY BOYS ════ */}
        {activeTab === 'Delivery' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Delivery boys ({deliveryBoys.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddDB(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {dbLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : deliveryBoys.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="bicycle-outline" size={36} color="#CCC" />
                <Text style={styles.emptyText}>No delivery boys added yet</Text>
              </View>
            ) : (
              deliveryBoys.map((u) => (
                <UserRow
                  key={u._id ?? u.id}
                  user={u}
                  role="delivery"
                  onDelete={loadDelivery}
                  onViewOrders={(partner) => setViewPartner(partner)}
                />
              ))
            )}
          </>
        )}

        {/* ════ SUPPLIERS ════ */}
        {activeTab === 'Suppliers' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Suppliers ({suppliers.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddSup(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            {supLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : suppliers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="storefront-outline" size={36} color="#CCC" />
                <Text style={styles.emptyText}>No suppliers added yet</Text>
              </View>
            ) : (
              suppliers.map((u) => (
                <UserRow
                  key={u._id ?? u.id}
                  user={u}
                  role="supplier"
                  onDelete={loadSuppliers}
                  onViewOrders={() => {}}
                />
              ))
            )}
          </>
        )}

        {/* ════ STOCK ════ */}
        {activeTab === 'Stock' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Stock levels</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddStock(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add Item</Text>
              </TouchableOpacity>
            </View>
            {stockLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : stock.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cube-outline" size={36} color="#CCC" />
                <Text style={styles.emptyText}>No stock data</Text>
              </View>
            ) : (
              stock.map((s) => {
                const low = s.quantity <= s.minThreshold;
                return (
                  <View key={s.productId} style={[styles.stockRow, low && styles.stockRowLow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stockName}>{s.productTitle}</Text>
                      <Text style={styles.stockMeta}>
                        Last restocked: {fmt(s.lastRestockedAt)}
                        {s.supplierId ? `  ·  Supplier #${s.supplierId}` : ''}
                      </Text>
                    </View>
                    <View style={styles.stockQtyWrap}>
                      <Text style={[styles.stockQty, low && styles.stockQtyLow]}>
                        {s.quantity}
                      </Text>
                      <Text style={styles.stockUnit}>{s.unit}</Text>
                      {low && (
                        <View style={styles.lowBadge}>
                          <Text style={styles.lowBadgeText}>Low</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ════ NOTIFY ════ */}
        {activeTab === 'Notify' && (
          <>
            <Text style={styles.sectionTitle}>Broadcast Notification</Text>
            <Text style={styles.notifyHint}>
              Send a push notification to all users. Use this for offers, new arrivals, events, or announcements.
            </Text>

            {/* Audience selector */}
            <Text style={styles.inputLabel}>Audience</Text>
            <View style={styles.audienceRow}>
              {[
                { key: 'customer',  label: '🛒 Customers' },
                { key: 'delivery',  label: '🚴 Delivery' },
                { key: 'supplier',  label: '🏭 Suppliers' },
              ].map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.audienceChip, bcRole === a.key && styles.audienceChipActive]}
                  onPress={() => setBcRole(a.key)}
                >
                  <Text style={[styles.audienceChipText, bcRole === a.key && styles.audienceChipTextActive]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick templates */}
            <Text style={styles.inputLabel}>Quick templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {[
                { label: '🎉 New Arrival',  title: '🎉 New Product Alert!',      body: 'We just added fresh new items to our catalog. Check them out now!' },
                { label: '💰 Offer',        title: '💰 Special Offer Today!',    body: 'Enjoy exclusive discounts on selected items. Limited time only!' },
                { label: '📅 Event',        title: '📅 Upcoming Event',          body: 'We have an exciting event coming up. Stay tuned for more details!' },
                { label: '🚀 Flash Sale',   title: '🚀 Flash Sale — Hurry!',     body: 'Flash sale is live for the next 2 hours. Grab your favourites now!' },
                { label: '🙏 Thank You',    title: '🙏 Thank You!',              body: 'Thank you for being a valued Fresh Basket customer. We appreciate you!' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.label}
                  style={styles.presetChip}
                  onPress={() => { setBcTitle(t.title); setBcBody(t.body); }}
                >
                  <Text style={styles.presetChipText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Compose */}
            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 🎉 Weekend Offer!"
              value={bcTitle}
              onChangeText={setBcTitle}
            />

            <Text style={styles.inputLabel}>Message *</Text>
            <TextInput
              style={[styles.input, { height: 96, textAlignVertical: 'top', marginBottom: 4 }]}
              placeholder="Write your message here…"
              value={bcBody}
              onChangeText={setBcBody}
              multiline
            />

            <TouchableOpacity
              style={[styles.broadcastBtn, bcSending && { opacity: 0.6 }]}
              disabled={bcSending}
              onPress={async () => {
                if (!bcTitle.trim() || !bcBody.trim()) {
                  Alert.alert('Required', 'Title and message cannot be empty.'); return;
                }
                Alert.alert(
                  'Send to all?',
                  `This will send "${bcTitle}" to all ${bcRole}s. Continue?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Send',
                      onPress: async () => {
                        setBcSending(true);
                        try {
                          const result = await broadcastNotification(bcTitle.trim(), bcBody.trim(), bcRole);
                          const entry = {
                            id:   Date.now(),
                            title: bcTitle.trim(),
                            body:  bcBody.trim(),
                            role:  bcRole,
                            sent:  result.sent ?? 0,
                            time:  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                          };
                          setBcHistory((prev) => [entry, ...prev].slice(0, 20));
                          Alert.alert('✅ Sent!', `Delivered to ${result.sent} user(s). ${result.failed > 0 ? `${result.failed} failed.` : ''}`);
                          setBcTitle('');
                          setBcBody('');
                        } catch (err) {
                          Alert.alert('Failed', err.message);
                        } finally {
                          setBcSending(false);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              {bcSending
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.broadcastBtnText}>Send to all {bcRole}s</Text>
                  </>}
            </TouchableOpacity>

            {/* History */}
            {bcHistory.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Sent history</Text>
                {bcHistory.map((h) => (
                  <View key={h.id} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{h.title}</Text>
                      <Text style={styles.historyBody} numberOfLines={1}>{h.body}</Text>
                      <Text style={styles.historyMeta}>{h.role} · {h.time} · {h.sent} sent</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  kicker:       { color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 },
  title:        { fontSize: 26, fontWeight: '800', color: '#1A1A1A', marginTop: 2 },
  switchBtn:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF1E8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  switchBtnText:{ color: colors.primary, fontWeight: '700', fontSize: 13 },

  // Tabs
  tabBar:       { flexGrow: 0, marginBottom: 14 },
  tab:          { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: '#fff' },
  tabActive:    { backgroundColor: colors.primary },
  tabText:      { fontWeight: '700', color: '#888', fontSize: 13 },
  tabTextActive:{ color: '#fff' },

  loader: { marginTop: 40 },

  // Section headers
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 12, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 4 },
  addBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Overview stats
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statCard:      { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 1, alignItems: 'flex-start' },
  statValue:     { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginTop: 8 },
  statLabel:     { color: '#888', fontSize: 12, marginTop: 2 },

  // Order rows
  orderRow:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  orderRowId:    { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  orderRowMeta:  { color: '#555', fontSize: 12, marginTop: 2 },
  orderRowDate:  { color: '#AAA', fontSize: 11, marginTop: 2 },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  statusBadgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  notifyBtn:     { padding: 8, backgroundColor: '#FFF1E8', borderRadius: 20, marginLeft: 6 },

  // User rows
  userRow:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1, gap: 12 },
  userAvatar:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF1E8', alignItems: 'center', justifyContent: 'center' },
  userAvatarText:{ fontSize: 18, fontWeight: '800', color: colors.primary },
  userName:      { fontWeight: '700', color: '#1A1A1A', fontSize: 15 },
  userPhone:     { color: '#888', fontSize: 12, marginTop: 2 },
  onlinePill:    { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#EEEEEE' },
  onlinePillActive: { backgroundColor: '#E8F5E9' },
  onlinePillText:   { fontSize: 11, color: '#888', fontWeight: '600' },
  onlinePillTextActive: { color: '#2E7D32' },
  userActions:   { flexDirection: 'row', gap: 6 },
  iconBtn:       { padding: 8, backgroundColor: '#F5F5F5', borderRadius: 20 },

  // Stock rows
  stockRow:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  stockRowLow:   { borderLeftWidth: 3, borderLeftColor: '#C62828' },
  stockName:     { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  stockMeta:     { color: '#888', fontSize: 11, marginTop: 2 },
  stockQtyWrap:  { alignItems: 'flex-end' },
  stockQty:      { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  stockQtyLow:   { color: '#C62828' },
  stockUnit:     { color: '#888', fontSize: 11 },
  lowBadge:      { backgroundColor: '#FFEBEE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4 },
  lowBadgeText:  { color: '#C62828', fontWeight: '700', fontSize: 11 },

  // Empty state
  emptyBox:      { alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 40, marginTop: 8 },
  emptyText:     { color: '#AAA', fontWeight: '600', marginTop: 10 },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:     { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28 },
  modalHeaderRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  modalSubtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  modalHint:     { color: '#888', fontSize: 13, marginTop: 4, marginBottom: 4 },
  inputLabel:    { color: '#555', fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:         { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 15, color: '#1A1A1A' },
  modalBtns:     { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn:     { flex: 1, paddingVertical: 14, borderRadius: 28, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' },
  cancelBtnText: { color: '#888', fontWeight: '700' },
  saveBtn:       { flex: 2, paddingVertical: 14, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Unit chips
  unitChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginRight: 8, marginTop: 4 },
  unitChipActive:   { backgroundColor: colors.primary },
  unitChipText:     { color: '#888', fontWeight: '600', fontSize: 13 },
  unitChipTextActive: { color: '#fff' },

  // Notification preset chips
  presetChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF1E8', marginRight: 8 },
  presetChipText: { color: colors.primary, fontWeight: '600', fontSize: 12 },

  // Broadcast / Notify tab
  notifyHint:       { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  audienceRow:      { flexDirection: 'row', gap: 8, marginBottom: 4 },
  audienceChip:     { flex: 1, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0F0F0', alignItems: 'center' },
  audienceChipActive:   { backgroundColor: colors.primary },
  audienceChipText:     { fontWeight: '700', color: '#888', fontSize: 13 },
  audienceChipTextActive: { color: '#fff' },
  broadcastBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 28, marginTop: 16 },
  broadcastBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  historyRow:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  historyTitle:     { fontWeight: '700', color: '#1A1A1A', fontSize: 14 },
  historyBody:      { color: '#666', fontSize: 12, marginTop: 2 },
  historyMeta:      { color: '#AAA', fontSize: 11, marginTop: 4 },
});
