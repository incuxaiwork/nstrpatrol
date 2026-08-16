package com.nstrpatrol.app.ui.screens

import com.nstrpatrol.app.R

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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nstrpatrol.app.ui.components.FieldLabel
import com.nstrpatrol.app.ui.components.PrimaryButton
import com.nstrpatrol.app.ui.components.RemarksField
import com.nstrpatrol.app.ui.theme.Background
import com.nstrpatrol.app.ui.theme.ErrorRed
import com.nstrpatrol.app.ui.theme.ForestGreen
import com.nstrpatrol.app.ui.theme.NstrIcons
import com.nstrpatrol.app.ui.theme.TextSecondary
import kotlinx.coroutines.launch

/** Login screen: brand mark, credentials. Users are provisioned from the admin side. */
@Composable
fun LoginScreen(
    onLogin: suspend (username: String, password: String) -> String?,
    onSuccess: () -> Unit
) {
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

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
                text = stringResource(R.string.login_title),
                color = ForestGreen,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.login_subtitle),
                color = TextSecondary,
                fontSize = 15.sp
            )
            Spacer(Modifier.height(44.dp))

            Column(modifier = Modifier.fillMaxWidth()) {
                FieldLabel(text = stringResource(R.string.login_username))
                Spacer(Modifier.height(8.dp))
                RemarksField(
                    value = username,
                    onValueChange = { username = it },
                    placeholder = stringResource(R.string.login_username_hint),
                    height = 48
                )
                Spacer(Modifier.height(16.dp))
                FieldLabel(text = stringResource(R.string.login_password))
                Spacer(Modifier.height(8.dp))
                RemarksField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = stringResource(R.string.login_password_hint),
                    height = 48,
                    isPassword = true
                )
                Spacer(Modifier.height(28.dp))
                PrimaryButton(
                    text = if (loading) stringResource(R.string.login_signing_in) else stringResource(R.string.login_button),
                    onClick = {
                        if (!loading) {
                            loading = true
                            error = null
                            scope.launch {
                                val err = onLogin(username, password)
                                if (err == null) {
                                    onSuccess()
                                } else {
                                    error = err
                                    loading = false
                                }
                            }
                        }
                    },
                    height = 52,
                    textSize = 17,
                    textWeight = FontWeight.SemiBold
                )
                if (error != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = error ?: "",
                        color = ErrorRed,
                        fontSize = 13.sp,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            Text(
                text = stringResource(R.string.login_official),
                color = TextSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(bottom = 28.dp)
            )
        }
    }
}
