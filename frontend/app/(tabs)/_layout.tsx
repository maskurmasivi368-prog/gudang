import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";

import { useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="shippingbox.fill" />
          <NativeTabs.Trigger.Label>Terima</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="audit">
          <NativeTabs.Trigger.Icon sf="checkmark.seal.fill" />
          <NativeTabs.Trigger.Label>Audit</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="inventory">
          <NativeTabs.Trigger.Icon sf="cube.box.fill" />
          <NativeTabs.Trigger.Label>Stok</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="account">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Menu</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: "IBMPlexSans-Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Terima",
          tabBarIcon: ({ color, size }) => (
            <MaterialDesignIcons name="package-down" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: "Audit",
          tabBarIcon: ({ color, size }) => (
            <MaterialDesignIcons name="clipboard-check-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Stok",
          tabBarIcon: ({ color, size }) => (
            <MaterialDesignIcons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => (
            <MaterialDesignIcons name="view-grid-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
