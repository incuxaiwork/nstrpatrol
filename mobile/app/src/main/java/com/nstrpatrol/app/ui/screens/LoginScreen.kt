package com.nstrpatrol.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.theme.Background
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.NstrIcons
import com.nstrpatrol.app.ui.theme.TextSecondary

/** Login screen: brand mark, credentials, entry into the app. */
@Composable
fun LoginScreen(onLogin: () -> Unit) {
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(horizontal = 24.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(40.dp))
            Box(
                modifier = Modifier.size(64.dp).background(ForestGreen, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = NstrIcons.Paw,
                    contentDescription = "NSTR Patrol",
                    tint = Color.White,
                    modifier = Modifier.size(64.dp)
                )
            }
            Spacer(Modifier.height(20.dp))
            Text(
                text = "Login",
                color = ForestGreen,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Secure entry for field officers & staff",
                color = TextSecondary,
                fontSize = 15.sp
            )
            Spacer(Modifier.height(44.dp))

            Column(modifier = Modifier.fillMaxWidth()) {
                FieldLabel(text = "User name")
                Spacer(Modifier.height(8.dp))
                RemarksField(
                    value = username,
                    onValueChange = { username = it },
                    placeholder = "Enter your username",
                    height = 48
                )
                Spacer(Modifier.height(16.dp))
                FieldLabel(text = "Password")
                Spacer(Modifier.height(8.dp))
                RemarksField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = "Enter your password",
                    height = 48,
                    isPassword = true
                )
                Spacer(Modifier.height(28.dp))
                PrimaryButton(
                    text = "Login",
                    onClick = onLogin,
                    height = 52,
                    textSize = 17,
                    textWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.weight(1f))
            Text(
                text = "For official use only",
                color = TextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 28.dp)
            )
        }
    }
}
